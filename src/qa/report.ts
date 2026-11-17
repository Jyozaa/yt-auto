import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ffmpeg, probe} from '../audio/process';
import {fps} from '../story/schema';
import type {Film} from '../story/timeline';
import {reviewShots, roles} from './review';

export type Finding = {kind: string; message: string; frame?: number; shot?: number; repairable?: boolean};
const sampleWidth = 36;
const sampleHeight = 64;
const channels = 3;
const bytesPerFrame = sampleWidth * sampleHeight * channels;
const round = (n: number) => Math.round(n * 1000) / 1000;
const distance = (a: Uint8Array, b: Uint8Array) => {
  let sum = 0;
  for (let i = 0; i < bytesPerFrame; i++) sum += Math.abs(a[i] - b[i]);
  return sum / bytesPerFrame;
};

async function loudness(path: string, seconds?: number) {
  const {stderr} = await ffmpeg(['-nostats', '-i', path, ...(seconds ? ['-t', String(seconds)] : []),
    '-map', '0:a:0', '-af', 'ebur128=peak=true:framelog=verbose,silencedetect=n=-46dB:d=0.9', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const number = (pattern: RegExp) => {
    const match = summary.match(pattern);
    return match ? Number(match[1]) : null;
  };
  return {
    lufs: number(/\bI:\s+(-?[\d.]+) LUFS/),
    truePeak: number(/Peak:\s+(-?[\d.]+) dBFS/),
    silences: Array.from(stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g), (match) => ({
      end: Number(match[1]), seconds: Number(match[2])
    }))
  };
}

async function silenceSpans(path: string, seconds: number) {
  const {stderr} = await ffmpeg(['-nostats', '-i', path, '-t', String(seconds), '-af', 'silencedetect=n=-43dB:d=0.95', '-f', 'null', '-']);
  return Array.from(stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g), (match) =>
    ({end: Number(match[1]), seconds: Number(match[2])}));
}

async function voiceClicks(voice: string, seconds: number) {
  const {stdout} = await ffmpeg(['-v', 'error', '-i', voice, '-t', String(seconds), '-ar', '48000', '-ac', '1', '-f', 'f32le', '-']);
  const audio = new DataView(stdout.buffer, stdout.byteOffset, stdout.byteLength);
  const findings = [];
  let previous = 0, previousStep = 0;
  for (let i = 4; i + 4 < audio.byteLength; i += 4) {
    const current = audio.getFloat32(i, true);
    const step = Math.abs(current - previous);
    const nextStep = Math.abs(audio.getFloat32(i + 4, true) - current);
    if (step > .46 && previousStep < .09 && nextStep < .09) findings.push(i / 4 / 48000);
    previous = current;
    previousStep = step;
    if (findings.length >= 20) break;
  }
  return findings;
}

export async function inspectVideo(args: {
  video: string; dir: string; film: Film; frames: number; width: number; height: number; voice?: string; semantic?: boolean;
}) {
  const {video, dir, film, frames, width, height, voice, semantic} = args;
  await mkdir(dir, {recursive: true});
  const metadata = await probe(video);
  const videoStreams = metadata.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = metadata.streams.filter((stream) => stream.codec_type === 'audio');
  const picture = videoStreams[0];
  const track = audioStreams[0];
  const failures: Finding[] = [];
  if (videoStreams.length !== 1 || picture?.codec_name !== 'h264' || picture.width !== width || picture.height !== height ||
    picture.r_frame_rate !== '30/1' || picture.pix_fmt !== 'yuv420p') failures.push({kind: 'format', message: 'Expected one 30 fps H.264 yuv420p stream at the configured size'});
  if (audioStreams.length !== 1 || track?.codec_name !== 'aac' || track.channels !== 2 || track.sample_rate !== '48000') {
    failures.push({kind: 'audio-track', message: 'Expected one stereo 48 kHz AAC mix'});
  }
  for (const stream of [picture, track]) {
    const duration = Number(stream?.duration);
    if (!Number.isFinite(duration) || Math.abs(duration - frames / fps) > .09) failures.push({kind: 'duration', message: 'Track duration differs from storyboard'});
  }
  const {stdout: raw} = await ffmpeg(['-v', 'error', '-i', video, '-map', '0:v:0', '-an', '-vf',
    `scale=${sampleWidth}:${sampleHeight}:flags=area`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const count = Math.floor(raw.length / bytesPerFrame);
  if (count !== frames) failures.push({kind: 'frame-count', message: `Expected ${frames} frames, decoded ${count}`});
  const sample = (n: number) => raw.subarray(n * bytesPerFrame, (n + 1) * bytesPerFrame);
  let frozen = 0;
  let exposed = 0;
  const metrics = [];
  const images = [];
  let shotIndex = 0;
  for (let frame = 0; frame < count; frame++) {
    const pixels = sample(frame);
    if (shotIndex + 1 < film.shots.length && frame >= film.shots[shotIndex + 1].start) shotIndex++;
    const shot = film.shots[shotIndex];
    const transition = Math.min(frame - shot.start, shot.end - frame) < 3 ||
      (shot.beat.transition === 'dissolve' && frame - shot.start < 9);
    let brightness = 0, dark = 0, highlights = 0, chroma = 0, edges = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const y = (.2126 * r + .7152 * g + .0722 * b) / 255;
      brightness += y;
      dark += Number(y < .045);
      highlights += Number(y > .955);
      chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      if (i % (sampleWidth * 3)) edges += (Math.abs(r - pixels[i - 3]) + Math.abs(g - pixels[i - 2]) + Math.abs(b - pixels[i - 1])) / 765;
    }
    const pixelCount = sampleWidth * sampleHeight;
    const motion = frame > 0 ? distance(pixels, sample(frame - 1)) : 0;
    metrics.push({frame, shot: shotIndex, brightness: round(brightness / pixelCount), dark: round(dark / pixelCount),
      highlights: round(highlights / pixelCount), chroma: round(chroma / pixelCount), detail: round(edges / pixelCount), motion: round(motion)});
    if (dark / pixelCount > .98 && !failures.some((f) => f.kind === 'black' && f.shot === shotIndex)) {
      failures.push({kind: 'black', frame, shot: shotIndex, message: 'Nearly all pixels are black'});
    }
    if (!transition && highlights / pixelCount > .985 && !failures.some((f) => f.kind === 'white' && f.shot === shotIndex)) {
      failures.push({kind: 'white', frame, shot: shotIndex, repairable: true, message: 'Nearly all pixels are white outside a transition'});
    }
    exposed = !transition && (brightness / pixelCount < .079 || brightness / pixelCount > .935) ? exposed + 1 : 0;
    if (exposed === 12) failures.push({kind: 'exposure', frame: frame - 11, shot: shotIndex, repairable: true,
      message: 'Frame exposure stayed outside the safe range for 12 frames'});
    frozen = !transition && motion < .095 ? frozen + 1 : 0;
    if (frozen === 18 && !failures.some((f) => f.kind === 'freeze' && f.shot === shotIndex)) {
      failures.push({kind: 'freeze', frame: frame - 17, shot: shotIndex, message: 'Picture barely moved for at least 18 frames'});
    }
    if (!transition && frame + 1 < count && motion > 27 && distance(sample(frame - 1), sample(frame + 1)) < 13 &&
      !failures.some((f) => f.kind === 'flash' && f.shot === shotIndex)) {
      failures.push({kind: 'flash', frame, shot: shotIndex, message: 'Isolated frame discontinuity'});
    }
  }
  const panels = [];
  for (const [index, shot] of film.shots.entries()) {
    const end = Math.min(shot.end, count);
    if (end <= shot.start) break;
    if (index > 0 && end > shot.start + 8 && shot.beat.transition === 'dissolve') {
      const start = shot.start;
      const outgoing = sample(start - 1), incoming = sample(start + 7);
      const contrast = distance(outgoing, incoming);
      const blended = [2, 3, 4, 5].some((offset) => {
        const middle = sample(start + offset);
        return distance(outgoing, middle) < contrast * .93 && distance(incoming, middle) < contrast * .93;
      });
      if (contrast > 13 && !blended) failures.push({kind: 'transition', frame: start, shot: index,
        message: 'Planned dissolve has no blended intermediate frame'});
    }
    const length = end - shot.start;
    const values = [.20, .50, .80].map((fraction) => Math.min(end - 1, shot.start + Math.floor(length * fraction)));
    const stills = [];
    for (const [sampleIndex, frame] of values.entries()) {
      const path = join(dir, `shot-${String(index + 1).padStart(2, '0')}-${sampleIndex + 1}.jpg`);
      await ffmpeg(['-v', 'error', '-ss', (frame / fps).toFixed(6), '-i', video, '-vf', 'scale=270:480:flags=lanczos',
        '-frames:v', '1', '-q:v', '3', '-update', '1', path]);
      stills.push(path);
    }
    const strip = metrics.slice(shot.start, end);
    const mean = (key: 'brightness' | 'chroma' | 'detail' | 'motion') => round(strip.reduce((sum, m) => sum + m[key], 0) / strip.length);
    panels.push({index, frames: values, stills, cameraMotion: mean('motion'), materialDetail: mean('detail'),
      luminance: mean('brightness'), chroma: mean('chroma'), actorCount: shot.scene.actors.length, propCount: shot.scene.props.length,
      focusBlur: shot.beat.camera.blur, narrativeRole: shot.beat.role, timedActions: shot.actions.length});
    images.push({index, stills});
  }
  if (count > 0) await ffmpeg(['-v', 'error', '-i', video, '-vf',
    `fps=${Math.min(24, count)}/${count / fps},scale=144:256:flags=area,tile=6x4:padding=4:margin=4:color=0x242437`,
    '-frames:v', '1', '-q:v', '3', '-update', '1', join(dir, 'contact-sheet.jpg')]);
  const levels = track && await loudness(video);
  const [voiceSilences, clicks] = voice ? await Promise.all([
    silenceSpans(voice, frames / fps), voiceClicks(voice, frames / fps)
  ]) : [[], []];
  if (clicks.length) failures.push({kind: 'voice-pop', message: 'Isolated abrupt sample steps in narration'});
  if (levels && (levels.lufs === null || levels.lufs < -16 || levels.lufs > -13 ||
    levels.truePeak === null || levels.truePeak > -1 || levels.silences.length)) {
    failures.push({kind: 'levels', message: 'Mix loudness, true peak or silence is outside acceptance bounds'});
  }
  if (voiceSilences.length) failures.push({kind: 'speech', message: 'Narration has an unexpected silent span of 0.95 seconds or longer'});
  let semanticError: string | undefined;
  const vision = semantic ? await reviewShots(film, images).catch((error: unknown) => {
    semanticError = error instanceof Error ? error.message : String(error);
    failures.push({kind: 'vision-provider', message: 'Configured visual review failed. See semanticError in report.json.'});
    return [];
  }) : [];
  for (const review of vision.filter((entry) => entry.severity === 'block')) {
    failures.push({kind: `vision-${review.role}`, shot: review.shot, message: review.findings.join(' / '),
      repairable: review.repair === 'soften-look' && ['post', 'lighting'].includes(review.role)});
  }
  const fixes = [
    ...failures.map(({kind, shot, frame, message, repairable}) => ({kind, shot, frame, message, action: repairable ? 'Soften selected shot and recheck' : 'Revise and render again'})),
    ...vision.filter(({severity}) => severity !== 'pass').map((entry) => ({
      kind: entry.role, shot: entry.shot, message: entry.findings.join(' / '),
      action: entry.fix ?? (entry.repair === 'soften-look' ? 'Reduce blur and grade strength' : 'Review this shot manually')
    }))
  ];
  const report = {passed: failures.length === 0, expected: {frames, width, height, fps}, metadata, levels, voiceSilences, clicks,
    panels, failures, fixes, roles, vision,
    semanticError, semanticReview: !semantic ? 'skipped' : semanticError ? 'error' : vision.length > 0 ? 'provider' : 'unavailable'};
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(dir, 'frames.json'), JSON.stringify(metrics));
  await writeFile(join(dir, 'report.md'), [
    '# Render QA', '', `Result **${report.passed ? 'PASS' : 'FAIL'}**`, '',
    `Decoded ${count} frames at ${picture?.width} × ${picture?.height}.`,
    `Mix ${levels ? `${levels.lufs} LUFS and ${levels.truePeak} dBTP` : 'missing'}.`, '',
    '## Findings', '', ...(failures.length ? failures.map((f) => `- ${f.message}${f.frame === undefined ? '' : ` (frame ${f.frame})`}`) : ['- Automated checks passed.']),
    '', '## Fix list', '', ...(fixes.length ? fixes.map((fix) => `- ${fix.message} — ${fix.action}`) : ['- No technical fixes flagged.']),
    '', '## Visual review', '',
    ...(vision.length ? vision.flatMap((review) => [`- Shot ${review.shot + 1}, ${review.role} — ${review.severity}. ${review.findings.join(' ')}`]) :
      [`Semantic vision review: ${report.semanticReview}. Inspect the contact sheet and shot stills for artistic quality.`]),
    '', 'See report.json for per-shot measurements and frames.json for frame statistics.'
  ].join('\n') + '\n');
  return report;
}
