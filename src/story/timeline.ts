import {fps, wordsOf, type Beat, type Scene, type Story, type FacialCue, type WorldEvent} from './schema';

export type Word = {word: string; start: number; end: number; rms?: number};
export type Alignment = {duration: number; words: Word[]; provider: string};
export type TimedWorldEvent = WorldEvent & {frame: number; length: number; shot: number};
export type TimedFacialCue = FacialCue & {frame: number; length: number};
export type Shot = {
  start: number;
  end: number;
  beat: Beat;
  scene: Scene;
  emphasis: number;
  actions: (Beat['actions'][number] & {frame: number})[];
  sounds: (Beat['sounds'][number] & {frame: number})[];
  faces?: TimedFacialCue[];
  events?: TimedWorldEvent[];
  cameraKeys?: (NonNullable<Beat['camera']['keys']>[number] & {frame: number})[];
  effects?: (NonNullable<Beat['effects']>[number] & {frame: number})[];
};
export type TimedAction = Shot['actions'][number];
export type Film = {story: Story; shots: Shot[]; frames: number; events?: TimedWorldEvent[]};

export function verifyAlignment(story: Story, alignment: Alignment, enforceRuntime = true) {
  const expected = wordsOf(story.narration);
  if (!Number.isFinite(alignment.duration) || alignment.duration <= 0) throw new Error('Voice duration is invalid');
  if (enforceRuntime && (alignment.duration < 55 || alignment.duration > 70)) {
    throw new Error(`Narration is ${alignment.duration.toFixed(2)} seconds. Edit the script for 55–70 seconds or adjust the voice speed within its documented range.`);
  }
  if (!Array.isArray(alignment.words) || expected.length !== alignment.words.length) {
    throw new Error('Word alignment does not cover the narration');
  }
  if (alignment.provider.startsWith('kokoro:') && alignment.words[0]?.start > .16) {
    throw new Error('Kokoro narration starts after the first few frames');
  }
  let previous = 0;
  alignment.words.forEach(({word, start, end}, i) => {
    if (typeof word !== 'string' || word.toLowerCase() !== expected[i].toLowerCase() ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < previous - 0.008 ||
        end <= start || end > alignment.duration + 0.01 || start - previous > 1.3) {
      throw new Error(`Invalid or missing timing for narration word ${i}: ${expected[i]}`);
    }
    previous = end;
  });
  if (alignment.duration - previous > 1.4) throw new Error('Voice alignment ends too early');
  return alignment;
}

export function compile(story: Story, alignment: Alignment): Film {
  verifyAlignment(story, alignment);
  const frames = Math.ceil(alignment.duration * fps);
  let offset = 0;
  const shots = story.beats.map((beat, i): Shot => {
    const count = wordsOf(beat.text).length;
    const at = (word: number) => Math.round(alignment.words[offset + word].start * fps);
    const start = i ? at(0) : 0;
    const end = offset + count === alignment.words.length ? frames : at(count);
    if (end - start < 12) throw new Error(`Beat ${i + 1} is too short to stage`);
    const shot = {
      start, end, beat, scene: story.scenes.find((scene) => scene.id === beat.scene)!,
      emphasis: beat.camera.emphasis === undefined ? -1 : at(beat.camera.emphasis),
      actions: beat.actions.map((action) => ({...action, frame: Math.max(start, at(action.word) - 1)})),
      sounds: beat.sounds.map((sound) => ({...sound, frame: at(sound.word)})),
      faces: beat.acting?.cues.map((cue) => ({...cue,
        frame: Math.max(start, at(cue.word) - 2), length: Math.round(cue.duration * fps)
      })).sort((a, b) => a.frame - b.frame),
      events: beat.events?.map((event) => ({...event, shot: i,
        frame: at(event.word), length: Math.round(event.duration * fps)
      })),
      cameraKeys: beat.camera.keys?.map((key) => ({...key, frame: at(key.word)})),
      effects: beat.effects?.map((effect) => ({...effect, frame: Math.max(start, at(effect.word) - 1)}))
    };
    offset += count;
    return shot;
  });
  const events = shots.flatMap((shot) => shot.events ?? []).sort((a, b) => a.frame - b.frame);
  return {story, shots, frames, ...(events.length ? {events} : {})};
}
