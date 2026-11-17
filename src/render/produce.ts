import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {type Story} from '../story/schema';
import {compile} from '../story/timeline';
import {createVoice} from '../audio/voice';
import {createMix} from '../audio/mix';
import {inspectVideo} from '../qa/report';
import {config, renderVideo} from './video';

export async function produce(story: Story, dir: string, preview: boolean, stills = false) {
  await mkdir(dir, {recursive: true});
  const voice = await createVoice(story, dir);
  const film = compile(story, voice.alignment);
  const frames = preview ? Math.min(film.frames, 450) : film.frames;
  const {width, height, concurrency, samples} = config(preview);
  const attempts = Number(process.env.QA_REPAIR_ATTEMPTS ?? 1);
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 2) throw new Error('QA_REPAIR_ATTEMPTS must be 0, 1, or 2');
  await writeFile(join(dir, 'storyboard.json'), JSON.stringify({film, frames, width, height}, null, 2));
  const mix = stills ? '' : await createMix(film, voice.alignment, voice.output, frames, dir);
  console.log(`${story.id}: ${width}×${height}, ${frames} frames, ${voice.alignment.provider} narration`);
  const props = {film, frames, width, height, samples, repair: [] as number[]};
  let video = await renderVideo(dir, props, concurrency, mix, stills);
  if (!video) return;
  const inspect = (path: string, folder: string) => inspectVideo({film, frames, width, height, video: path,
    dir: join(folder, 'qa'), voice: voice.output, semantic: true});
  let report = await inspect(video, dir);
  for (let i = 0; i < attempts && !report.passed; i++) {
    if (report.failures.some((failure) => !failure.repairable || failure.shot === undefined)) break;
    const failures = [...new Set(report.failures.map((failure) => failure.shot!))];
    const repair = failures.filter((shot) => !props.repair.includes(shot));
    if (!repair.length) break;
    props.repair.push(...repair);
    const folder = join(dir, `repair-${i + 1}`);
    await mkdir(folder, {recursive: true});
    console.log(`Softening focus and grading in shots ${repair.map((shot) => shot + 1).join(', ')}`);
    video = (await renderVideo(folder, {...props, repair}, concurrency, mix, false, video))!;
    const previous = report;
    report = await inspect(video, folder);
    await writeFile(join(folder, 'comparison.json'), JSON.stringify({
      adjustedShots: repair, before: previous.failures, after: report.failures, accepted: report.passed
    }, null, 2));
  }
  if (!report.passed) throw new Error('Render did not pass QA. See report.md and any repair comparison under the output directory.');
  await writeFile(join(dir, 'result.json'), JSON.stringify({video, report: report.expected, repaired: props.repair}));
  return video;
}
