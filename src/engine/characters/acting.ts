import type {TimedFacialCue} from '../../story/timeline';
import {ease} from '../../story/world-events';

export function faceAt(cues: readonly TimedFacialCue[], frame: number) {
  const cue = cues.findLast((entry) => entry.frame <= frame);
  if (!cue || frame >= cue.frame + cue.length) return;
  const age = frame - cue.frame;
  const remaining = cue.length - age;
  const previous = cues.findLast((entry) => entry.frame < cue.frame && entry.frame + entry.length > cue.frame);
  const settle = (entry: TimedFacialCue, at: number) =>
    ease((at - entry.frame + 1) / 5) * ease((entry.frame + entry.length - at) / 8) * (entry.intensity ?? 1);
  const mix = ease((age + 1) / 5);
  const old = previous ? (1 - mix) * settle(previous, cue.frame - 1) : 0;
  const weight = mix * ease(remaining / 8) * (cue.intensity ?? 1);
  const ramp = (a = 0, b = 0) => a * weight + b * old;
  return {
    expression: remaining <= 3 && weight < .12 ? undefined : cue.expression,
    turn: ramp(cue.turn, previous?.turn),
    tilt: ramp(cue.tilt, previous?.tilt),
    face: {eyes: [ramp(cue.eyes?.[0], previous?.eyes?.[0]), ramp(cue.eyes?.[1], previous?.eyes?.[1])] as [number, number],
      brow: cue.brow, mouth: cue.mouth, intensity: Math.max(.2, weight + old)},
    blink: cue.blink === 'closed' ? ease((age + 1) / 3) * ease(remaining / 3) :
      cue.blink === 'open' ? 0 : cue.blink === 'blink' ? [.5, 1, 1, .5][age] : undefined
  };
}
