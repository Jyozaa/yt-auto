import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ffmpeg} from './process';
import {fps} from '../story/schema';
import type {Alignment, Film} from '../story/timeline';

const rate = 48_000;
const tau = Math.PI * 2;
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

function volume(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be in [0, 1]`);
  return value;
}

export async function createMix(film: Film, alignment: Alignment, voice: string, frames: number, dir: string) {
  const duration = frames / fps;
  const samples = Math.ceil(duration * rate);
  const backing = new Float32Array(samples * 2);
  const add = (start: number, length: number, gain: number, pan: number, fn: (t: number) => number) => {
    const from = Math.round(start * rate);
    const count = Math.min(samples - from, Math.floor(length * rate));
    for (let i = 0; i < count; i++) {
      const value = gain * fn(i / rate);
      backing[2 * (i + from)] += value * (1 - pan);
      backing[2 * (i + from) + 1] += value * (1 + pan);
    }
  };
  const score = volume('MUSIC_GAIN', .22);
  const effects = volume('SFX_GAIN', .34);
  const duck = volume('MUSIC_DUCK', .40);
  const changes = [[50, 57, 62, 65], [46, 53, 57, 62], [53, 57, 60, 65], [48, 55, 60, 64]];
  const melody = [0, 2, 1, 3, 2, 0, 3, 1];
  for (let i = 0; i * .47 < duration; i++) {
    const chord = changes[Math.floor(i / 8) % changes.length];
    const note = frequency(i % 2 ? chord[melody[i % 8]] + 12 : chord[0] - 12);
    const pan = i % 2 ? (i % 4 === 1 ? -.32 : .28) : 0;
    add(i * .47, i % 2 ? 1.12 : .6, score * (i % 2 ? .28 : .42), pan, (t) =>
      Math.min(1, t * 95) * Math.exp(-t * 5.3) *
      (.74 * Math.sin(tau * note * t) + .18 * Math.sin(tau * 2 * note * t) + .08 * Math.sin(tau * note * 3.005 * t)));
  }
  let word = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    while (word + 1 < alignment.words.length && alignment.words[word].end + .12 < t) word++;
    const current = alignment.words[word];
    const mask = Math.max(0, Math.min(1, (t - current.start + .055) * 32, (current.end + .12 - t) * 12));
    backing[2 * i] *= 1 - mask * duck;
    backing[2 * i + 1] *= 1 - mask * duck;
    const room = .004 * Math.sin(tau * 47 * t) * (.75 + .25 * Math.sin(2 * t));
    backing[2 * i] += room;
    backing[2 * i + 1] += room * .88;
  }
  let seed = 0x0bf214bb;
  const noise = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
  const footfalls = film.shots.flatMap((shot) => shot.actions.flatMap((action) => {
    if (action.kind !== 'walk') return [];
    return Array.from({length: Math.ceil(action.duration * 2.96)}, (_, i) => ({
      kind: 'step' as const, frame: action.frame + Math.round(i * fps / 2.96)
    })).filter((cue) => cue.frame < shot.end);
  }));
  for (const cue of [...film.shots.flatMap((shot) => shot.sounds), ...footfalls]) {
    if (cue.frame >= frames) continue;
    const at = cue.frame / fps;
    if (cue.kind === 'chime') {
      add(at, .76, effects * .52, -.24, (t) => Math.min(1, t * 180) * Math.exp(-t * 8) *
        (.68 * Math.sin(tau * 659 * t) + .32 * Math.sin(tau * 1130 * t)));
    } else if (cue.kind === 'impact' || cue.kind === 'step') {
      add(at, .26, effects * (cue.kind === 'impact' ? .86 : .45), 0, (t) =>
        Math.min(1, t * 315) * Math.exp(-t * 22) * (.68 * Math.sin(tau * (80 - t * 140) * t) + .32 * noise()));
    } else {
      let air = 0;
      const length = cue.kind === 'whoosh' ? .52 : .24;
      add(at, length, effects * .8, .18, (t) => {
        air = air * .81 + .19 * noise();
        return air * Math.sin(Math.PI * t / length) ** 2 * (cue.kind === 'scrape' ? Math.cos(tau * 45 * t) : 1);
      });
    }
  }
  const bed = join(dir, 'score.f32');
  await writeFile(bed, Buffer.from(backing.buffer));
  const output = join(dir, 'mix.wav');
  await ffmpeg(['-loglevel', 'error', '-i', voice, '-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', bed,
    '-filter_complex', "[0:a]highpass=f=75,acompressor=threshold=0.12:ratio=3:attack=7:release=85,pan=stereo|c0=c0|c1=c0[v];[v][1:a]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-14.5:TP=-1.7:LRA=7[out]",
    '-map', '[out]', '-ar', String(rate), '-t', String(duration), '-c:a', 'pcm_s24le', output]);
  return output;
}
