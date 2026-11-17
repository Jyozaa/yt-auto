import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ffmpeg} from './process';
import {fps, type CueKind} from '../story/schema';
import type {Alignment, Film} from '../story/timeline';
import {stepsPerSecond} from '../engine/characters/gait';
import {arrangements, hz, instruments, ramp, rate, room, sound, type Signal} from './design';

function volume(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be in [0, 1]`);
  return value;
}

function stem(path: string, track: Float32Array) {
  const result = Buffer.alloc(44 + track.length * 2);
  result.write('RIFF', 0);
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(2, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 4, 28);
  result.writeUInt16LE(4, 32);
  result.writeUInt16LE(16, 34);
  result.write('data', 36);
  result.writeUInt32LE(result.length - 44, 40);
  for (let i = 0; i < track.length; i++) {
    if (!Number.isFinite(track[i]) || Math.abs(track[i]) > 1) throw new Error(`Invalid or clipped sample in ${path}`);
    result.writeInt16LE(Math.round(track[i] * 32767), 44 + i * 2);
  }
  return writeFile(path, result);
}

const identity = (name: string) => [...name].reduce((seed, ch) => Math.imul(seed ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
const impact = new Set<CueKind>(['impact', 'wood-hit', 'metal-hit', 'stone-hit', 'snap']);

export async function createMix(film: Film, alignment: Alignment, voice: string, frames: number, dir: string) {
  const duration = frames / fps;
  const samples = Math.round(duration * rate);
  const music = new Float32Array(samples * 2);
  const effects = new Float32Array(samples * 2);
  const musicGain = volume('MUSIC_GAIN', .20);
  const effectsGain = volume('SFX_GAIN', .31);
  const duck = volume('MUSIC_DUCK', .52);
  const seed = identity(film.story.id);
  const transpose = [0, -2, 2, 3, -3][seed % 5];
  const cues: {shot: number; kind: CueKind; frame: number; pan: number; gain: number; rms: number; origin: string}[] = [];
  const sections = [];
  const impacts = film.shots.flatMap((shot) => shot.sounds.filter((cue) => impact.has(cue.kind)).map((cue) => cue.frame / fps));

  function place(track: Float32Array, start: number, length: number, gain: number, pan: number, signal: Signal, fadeIn = .005) {
    const from = Math.round(start * rate);
    const count = Math.min(samples - from, Math.floor(length * rate));
    const left = Math.sqrt((1 - pan) / 2), right = Math.sqrt((1 + pan) / 2);
    let energy = 0;
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      const value = gain * signal(t) * ramp(t, fadeIn) * ramp((count - i - 1) / rate, .025);
      track[2 * (i + from)] += value * left;
      track[2 * (i + from) + 1] += value * right;
      energy += value * value;
    }
    return count > 0 ? Math.sqrt(energy / count) : 0;
  }

  let escalation = 0;
  for (const [index, shot] of film.shots.entries()) {
    if (shot.start >= frames) break;
    const start = shot.start / fps;
    const end = Math.min(frames, shot.end) / fps;
    const span = end - start;
    const role = shot.beat.role;
    escalation += Number(role === 'escalation');
    const theme = arrangements[role];
    const step = theme.step * (role === 'escalation' ? 1 - Math.min(.18, escalation * .041) : 1);
    const root = theme.root + transpose + (role === 'escalation' ? Math.min(3, escalation - 1) : 0);
    const shift = role === 'turn' ? .27 : 0;
    sections.push({shot: index, role, start, end, bpm: Math.round(60 / (step * 2)), root, instrument: theme.voice});
    for (let n = 0; n * step + shift < span; n++) {
      const time = n * step + shift;
      const at = start + time;
      if (impacts.some((hit) => at >= hit - .35 && at < hit + .28)) continue;
      const note = theme.pattern[(n + (role === 'payoff' ? 0 : seed % 2)) % theme.pattern.length];
      const envelope = role === 'escalation' ? .48 + .42 * time / span : role === 'turn' ? .40 : .68;
      if (note !== null) {
        place(music, at, Math.min(theme.sustain, span - time + .13), musicGain * envelope,
          n % 2 ? .25 : -.19, instruments[theme.voice](hz(root + note + 12)));
      }
      if (n % 4 === 0 && role !== 'turn') {
        place(music, at, Math.min(1.18, span - time + .1), musicGain * .66, -.09,
          instruments.bass(hz(root - 12 + (Math.floor(n / 4) % 2 ? 5 : 0))));
        if (role !== 'hook') place(music, at, Math.min(1.7, span - time + .15), musicGain * .47,
          .18, instruments.strings(hz(root + (role === 'analogy' ? 4 : 7))));
      }
    }

    place(effects, start, span + .1, .036, .19, room(shot.scene.environment, seed ^ (index + 11)), .095);
    const automatic = shot.actions.flatMap((action) => {
      const position = shot.scene.actors.find((entry) => entry.id === action.target)?.at[0] ?? 0;
      const pan = Math.max(-.58, Math.min(.58, position / 5));
      if (action.kind === 'walk') {
        const kind = shot.scene.environment === 'workshop' ? 'step-wood' :
          shot.scene.environment === 'terrace' ? 'step-earth' : 'step-stone';
        return Array.from({length: Math.ceil(action.duration * stepsPerSecond)}, (_, n) => ({
          kind: kind as CueKind, frame: action.frame + Math.round(n * fps / stepsPerSecond), pan, gain: .37, origin: 'walk'
        }));
      }
      return [];
    });
    const explicit = shot.sounds.map((cue) => ({...cue, origin: 'script',
      gain: cue.gain ?? .62, pan: cue.pan ?? (index % 2 ? -.17 : .19)}));
    const transitions = shot.beat.transition === 'dissolve' && index > 0 ?
      [{kind: 'whoosh' as const, frame: shot.start, pan: .15, gain: .20, origin: 'transition'}] : [];
    for (const cue of [...explicit, ...automatic, ...transitions]) {
      if (cue.frame >= Math.min(shot.end, frames)) continue;
      const effect = sound(cue.kind, (seed ^ cue.frame ^ Math.imul(cues.length + 21, 0x85ebca6b)) | 1);
      const rms = place(effects, cue.frame / fps, effect.length, effectsGain * cue.gain, cue.pan, effect.signal);
      cues.push({shot: index, ...cue, rms});
    }
  }

  let word = 0;
  let envelope = 0;
  let popCandidates = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    while (word + 1 < alignment.words.length && alignment.words[word].end + .075 < t) word++;
    const current = alignment.words[word];
    const spoken = Number(t >= current.start - .075 && t < current.end + .075);
    envelope += (spoken - envelope) / (rate * (spoken ? .028 : .28));
    const tail = ramp(duration - t, .23);
    for (const side of [0, 1]) {
      const n = 2 * i + side;
      music[n] *= (1 - envelope * duck) * tail;
      effects[n] *= tail;
      if (i > 0 && (Math.abs(effects[n] - effects[n - 2]) > .38 || Math.abs(music[n] - music[n - 2]) > .38)) popCandidates++;
    }
  }
  const missing = cues.filter(({rms, frame}) => rms < .00012 && frame / fps < duration - .05);
  const report = {sections, cues, missing, abruptSampleSteps: popCandidates, backingMuted: {music: musicGain === 0, effects: effectsGain === 0}};
  await writeFile(join(dir, 'cues.json'), JSON.stringify(report, null, 2));
  if ((effectsGain > 0 && missing.length) || popCandidates) throw new Error('Sound design QA failed. Inspect cues.json for missing effects or discontinuities.');

  const musicFile = join(dir, 'music.wav'), effectsFile = join(dir, 'effects.wav');
  const voiceFile = join(dir, 'voice-stem.wav');
  const output = join(dir, 'mix.wav');
  await Promise.all([stem(musicFile, music), stem(effectsFile, effects)]);
  await ffmpeg(['-loglevel', 'error', '-i', voice, '-af',
    'highpass=f=65,acompressor=threshold=0.13:ratio=2.1:attack=9:release=100,pan=stereo|c0=c0|c1=c0,apad',
    '-ar', String(rate), '-t', String(duration), '-c:a', 'pcm_s24le', voiceFile]);
  await ffmpeg(['-loglevel', 'error', '-i', voiceFile, '-i', musicFile, '-i', effectsFile,
    '-filter_complex', `[0:a][1:a][2:a]amix=inputs=3:normalize=0:duration=first,` +
      `loudnorm=I=-14.5:TP=-1.7:LRA=6,aresample=${rate},apad=whole_len=${samples},atrim=end_sample=${samples}[out]`,
    '-map', '[out]', '-c:a', 'pcm_s24le', output]);
  return output;
}
