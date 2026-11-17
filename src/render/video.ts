import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rm, statfs} from 'node:fs/promises';
import {availableParallelism, tmpdir, totalmem} from 'node:os';
import {join, resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {Props} from './index';
import {ffmpeg} from '../audio/process';

export const profiles = {preview: 360, hd: 1080, final: 1440} as const;
const supportedWidths = [180, 270, 360, 540, 720, 1080, 1440];
export function config(preview: boolean) {
  const width = Number(process.env[preview ? 'PREVIEW_WIDTH' : 'FINAL_WIDTH'] ?? (preview ? profiles.preview : profiles.final));
  const concurrency = Number(process.env.RENDER_CONCURRENCY ?? Math.min(width >= 1080 ? 2 : 3, availableParallelism()));
  const samples = Number(process.env.RENDER_MSAA ?? (width >= 1080 ? 4 : 0));
  if (!supportedWidths.includes(width)) throw new Error(`Render width must be one of ${supportedWidths.join(', ')}`);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > Math.min(8, availableParallelism())) {
    throw new Error('RENDER_CONCURRENCY must fit available CPUs and be in [1, 8]');
  }
  if (![0, 2, 4].includes(samples)) throw new Error('RENDER_MSAA must be 0, 2 or 4');
  return {width, height: width * 16 / 9, concurrency, samples};
}

export async function renderVideo(dir: string, input: Props, concurrency: number, mix: string, stillOnly = false, previous?: string) {
  const estimatedMemory = (input.width >= 1080 ? 4 + 1.25 * concurrency : 2.1 + .35 * concurrency) * 1024 ** 3;
  const linuxMemory = process.platform === 'linux' ? await readFile('/proc/meminfo', 'utf8') : '';
  const availableKb = linuxMemory.match(/^MemAvailable:\s+(\d+)/m)?.[1];
  const cgroupLimit = Number(await readFile('/sys/fs/cgroup/memory.max', 'utf8').catch(() => 'max'));
  const available = Math.min(totalmem(), availableKb ? Number(availableKb) * 1024 : Infinity,
    cgroupLimit > 0 ? cgroupLimit : Infinity);
  if (available < estimatedMemory) throw new Error('Insufficient memory for configured render size and concurrency');
  const parent = resolve(process.env.REMOTION_TMP ?? tmpdir());
  await mkdir(parent, {recursive: true});
  for (const folder of [parent, dir]) {
    const disk = await statfs(folder);
    const required = input.width >= 1080 ? 8 : 2;
    if (disk.bavail * disk.bsize < required * 1024 ** 3) throw new Error(`Need ${required} GiB free in ${folder}`);
  }
  const scratch = await mkdtemp(join(parent, 'yt-auto-'));
  const oldTemp = {TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP};
  for (const key of Object.keys(oldTemp)) process.env[key] = scratch;
  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    const serveUrl = await bundle({entryPoint: resolve('src/render/index.tsx'), outDir: join(scratch, 'bundle'), onProgress: () => {}});
    const installedChrome = process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome';
    const browserExecutable = process.env.CHROME_PATH ?? (existsSync(installedChrome) ? installedChrome : undefined);
    const gl = process.env.RENDER_GL ?? (process.platform === 'darwin' && browserExecutable ? 'angle' : 'swangle');
    if (gl !== 'angle' && gl !== 'swangle' && gl !== 'egl') throw new Error('RENDER_GL must be angle, swangle or egl');
    browser = await openBrowser('chrome', {chromiumOptions: {gl}, browserExecutable});
    const params = {serveUrl, puppeteerInstance: browser, inputProps: input, timeoutInMilliseconds: 60_000,
      onBrowserLog: (log: {type: string; text: string}) => { if (log.type === 'error') console.error(log.text); }};
    const composition = await selectComposition({...params, id: 'StoryShort'});
    if (stillOnly) {
      for (let i = 0; i < input.film.shots.length; i++) {
        const shot = input.film.shots[i];
        if (shot.start >= input.frames) break;
        await renderStill({...params, composition, frame: Math.floor((shot.start + Math.min(shot.end - 1, input.frames - 1)) / 2),
          output: join(dir, `shot-${String(i + 1).padStart(2, '0')}.png`)});
      }
      return;
    }
    const encode = async (outputLocation: string, frameRange?: [number, number]) => {
      let last = -10;
      await renderMedia({...params, composition, concurrency, outputLocation, frameRange, codec: 'h264', muted: true,
        pixelFormat: 'yuv420p', colorSpace: 'bt709', imageFormat: 'jpeg', jpegQuality: 92, crf: input.width >= 1080 ? 17 : 20,
        x264Preset: 'fast', onProgress: ({progress}) => {
          const percent = Math.floor(progress * 100);
          if (percent >= last + 10) { console.log(`Render ${percent}%`); last = percent; }
        }});
    };
    const muted = join(scratch, 'picture.mp4');
    const output = join(dir, 'short.mp4');
    if (previous) {
      const ranges = input.repair.map((index): [number, number] => {
        const shot = input.film.shots[index];
        const next = input.film.shots[index + 1];
        const tail = next?.beat.transition === 'dissolve' ? 7 : 0;
        return [shot.start, Math.min(input.frames, shot.end + tail) - 1];
      });
      const files: string[] = [];
      for (const [index, range] of ranges.entries()) {
        const path = join(scratch, `repair-${index}.mp4`);
        await encode(path, range);
        files.push(path);
      }
      const filter = ranges.flatMap(([start, end], index) => [
        `[${index + 1}:v]settb=1/30,setpts=PTS-STARTPTS+${start}[r${index}]`,
        `[${index ? 'o' + (index - 1) : '0:v'}][r${index}]overlay=eof_action=pass:enable='between(t,${start / 30},${(end + .5) / 30})'[o${index}]`
      ]).join(';');
      await ffmpeg(['-loglevel', 'error', '-i', previous, ...files.flatMap((path) => ['-i', path]),
        '-filter_complex', filter, '-map', `[o${ranges.length - 1}]`, '-map', '0:a:0', '-c:a', 'copy',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
      return output;
    }
    await encode(muted);
    await ffmpeg(['-loglevel', 'error', '-i', muted, '-i', mix, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-t', String(input.frames / 30), '-movflags', '+faststart', output]);
    return output;
  } finally {
    try { await browser?.close({silent: true}); }
    finally {
      for (const [key, value] of Object.entries(oldTemp)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(scratch, {recursive: true, force: true});
    }
  }
}
