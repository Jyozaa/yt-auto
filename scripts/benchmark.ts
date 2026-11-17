import {execFile} from 'node:child_process';
import {mkdir, readFile, stat, statfs, writeFile} from 'node:fs/promises';
import {availableParallelism, platform, tmpdir, totalmem} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs, promisify} from 'node:util';
import {ffmpeg, probe} from '../src/audio/process';
import {config, renderVideo} from '../src/render/video';
import {fps} from '../src/story/schema';
import type {Film} from '../src/story/timeline';

const exec = promisify(execFile);
const {positionals, values} = parseArgs({allowPositionals: true, options: {
  output: {type: 'string'}, widths: {type: 'string'}, frames: {type: 'string'}
}});
const storyboard = resolve(positionals[0] ?? 'out/foucault-floor/full/storyboard.json');
const mix = resolve(positionals[1] ?? join(dirname(storyboard), 'mix.wav'));
const dir = resolve(values.output ?? 'out/benchmark');
const {film} = JSON.parse(await readFile(storyboard, 'utf8')) as {film: Film};
const frames = Number(values.frames ?? 72);
if (!Number.isInteger(frames) || frames < 24 || frames > 300) throw new Error('--frames must be 24–300');
const anchor = film.shots.find((shot, i) => i > 0 && shot.beat.transition === 'dissolve') ?? film.shots[1];
const offset = Math.max(0, Math.min(film.frames - frames, anchor.start - Math.floor(frames / 3)));

async function descendantRss() {
  const {stdout} = await exec('ps', ['-axo', 'pid=,ppid=,rss=']);
  const rows = stdout.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const children = new Map<number, number[][]>();
  for (const row of rows) {
    if (row[0] === process.pid) continue;
    const group = children.get(row[1]) ?? [];
    group.push(row);
    children.set(row[1], group);
  }
  const sum = (pid: number): number => (children.get(pid) ?? []).reduce((use, row) => use + row[2] * 1024 + sum(row[0]), 0);
  return sum(process.pid) + process.memoryUsage().rss;
}

const widths = (values.widths ?? '360,720,1080,1440').split(',');
if (widths.some((width) => !['360', '720', '1080', '1440'].includes(width)) || new Set(widths).size !== widths.length) {
  throw new Error('--widths must select distinct widths from 360,720,1080,1440');
}
const results = [];
let reference: string | undefined;
await mkdir(dir, {recursive: true});
const slice = join(dir, 'benchmark-mix.wav');
await ffmpeg(['-v', 'error', '-ss', (offset / fps).toFixed(6), '-i', mix, '-t', String(frames / fps), '-c:a', 'pcm_s24le', slice]);
for (const value of widths) {
  process.env.FINAL_WIDTH = value;
  process.env.RENDER_MSAA ??= '0';
  const {width, height, concurrency, samples} = config(false);
  const folder = join(dir, value);
  await mkdir(folder, {recursive: true});
  const scratch = resolve(process.env.REMOTION_TMP || tmpdir());
  await mkdir(scratch, {recursive: true});
  const disk = await statfs(scratch);
  let peakRss = await descendantRss();
  let sampling = false;
  const timer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    void descendantRss().then((value) => { peakRss = Math.max(value, peakRss); }).catch(() => {})
      .finally(() => { sampling = false; });
  }, 260);
  const start = performance.now();
  try {
    const path = (await renderVideo(folder, {film, width, height, frames, offset, repair: [], samples}, concurrency, slice))!;
    const elapsed = (performance.now() - start) / 1000;
    const metadata = await probe(path);
    const still = join(folder, 'comparison.jpg');
    await ffmpeg(['-v', 'error', '-ss', String(frames / fps / 2), '-i', path, '-vf',
      'scale=360:640:flags=lanczos', '-frames:v', '1', '-update', '1', still]);
    let ssim: number | null = null;
    if (reference) {
      const {stderr} = await ffmpeg(['-nostats', '-i', reference, '-i', path, '-filter_complex',
        '[0:v]scale=360:640:flags=lanczos,setsar=1[a];[1:v]scale=360:640:flags=lanczos,setsar=1[b];[a][b]ssim',
        '-an', '-f', 'null', '-']);
      ssim = Number(stderr.match(/All:([\d.]+)/)?.[1]) || null;
    }
    reference ??= path;
    results.push({width, height, samples, concurrency, duration: Number(metadata.format.duration), elapsed,
      effectiveFps: frames / elapsed, peakRss, freeScratchBytes: disk.bavail * disk.bsize, bytes: (await stat(path)).size, ssim});
  } catch (error) {
    results.push({width, height, samples, concurrency, peakRss, freeScratchBytes: disk.bavail * disk.bsize,
      elapsed: (performance.now() - start) / 1000, error: String(error)});
  } finally {
    clearInterval(timer);
  }
  await writeFile(join(dir, 'benchmark.json'), JSON.stringify({platform: platform(), cpuCount: availableParallelism(), ram: totalmem(),
    gl: process.env.RENDER_GL ?? 'auto', referenceWidth: Number(widths[0]), offset, frames, results}, null, 2));
}
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => 'error' in result)) process.exitCode = 1;
