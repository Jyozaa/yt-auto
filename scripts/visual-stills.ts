// Frame-specific comparisons inspired by the MIT-licensed bridge-stills.mjs.
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {Props} from '../src/render/index';

const {values} = parseArgs({options: {
  baseline: {type: 'boolean'}, frames: {type: 'string'}, range: {type: 'string'}, storyboard: {type: 'string'},
  width: {type: 'string', default: '540'}, output: {type: 'string', default: 'out/visual-stills'}
}});
const width = Number(values.width);
const height = width * 16 / 9;
const frames = (values.frames ?? values.range ?? '').split(',').map((value) => value.trim() ? Number(value) : NaN);
if (Boolean(values.frames) === Boolean(values.range) || frames.some((frame) => !Number.isInteger(frame) || frame < 0)) {
  throw new Error('Provide --frames with comma-separated frame numbers or --range with start,end');
}
if (values.range && (frames.length !== 2 || frames[1] < frames[0] || frames[1] - frames[0] > 179)) {
  throw new Error('--range accepts an inclusive clip of up to 180 frames');
}
if (width % 9 || width < 180 || width > 1440) throw new Error('Use a width from 180 to 1440 divisible by 9');
if (Boolean(values.baseline) === Boolean(values.storyboard)) {
  throw new Error('Select --baseline or provide --storyboard');
}
const dir = resolve(values.output);
const tmp = resolve(process.env.REMOTION_TMP ?? tmpdir());
await Promise.all([mkdir(dir, {recursive: true}), mkdir(tmp, {recursive: true})]);
const scratch = await mkdtemp(join(tmp, 'yt-style-'));
const inputProps = {width, height, samples: width >= 1080 ? 4 : 0, ...(!values.baseline && {
  ...JSON.parse(await readFile(values.storyboard!, 'utf8')) as Pick<Props, 'film' | 'frames'>,
  width, height, repair: []
})};
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  const serveUrl = await bundle({entryPoint: resolve(values.baseline ? 'src/render/baseline.tsx' : 'src/render/index.tsx'),
    outDir: join(scratch, 'bundle'), onProgress: () => {}});
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executable = process.env.CHROME_PATH ?? (process.platform === 'darwin' && existsSync(chrome) ? chrome : undefined);
  browser = await openBrowser('chrome', {browserExecutable: executable, chromiumOptions: {
    gl: process.platform === 'darwin' && executable ? 'angle' : 'swangle'
  }});
  const options = {serveUrl, inputProps, puppeteerInstance: browser, timeoutInMilliseconds: 120_000};
  const composition = await selectComposition({...options, id: values.baseline ? 'SourceStyleBaseline' : 'StoryShort'});
  if (values.range) {
    const outputLocation = join(dir, 'visual-clip.mp4');
    await renderMedia({...options, composition, outputLocation, frameRange: [frames[0], frames[1]], muted: true,
      codec: 'h264', pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92, concurrency: 1});
    console.log(outputLocation);
  } else for (const frame of frames) {
    const output = join(dir, `frame-${String(frame).padStart(4, '0')}.png`);
    const start = performance.now();
    await renderStill({...options, composition, frame, output});
    console.log(`${output} (${((performance.now() - start) / 1000).toFixed(2)}s)`);
  }
} finally {
  try { await browser?.close({silent: true}); }
  finally { await rm(scratch, {recursive: true, force: true}); }
}
