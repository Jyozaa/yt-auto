import {fps} from '../../story/schema';
import {ease} from '../../story/world-events';

// Phase 0 and .5 are the source stance contacts.
export const stepsPerSecond = 2.8;
export const cadence = (kind: 'walk' | 'run') => kind === 'run' ? 3.8 : stepsPerSecond;

type Movement = {kind: 'walk' | 'run'; frame: number; duration: number};

export function gaitAt(action: Movement, frame: number) {
  const t = Math.max(0, Math.min(1, (frame - action.frame) / (action.duration * fps)));
  const run = action.kind === 'run';
  const stepCount = action.duration * cadence(action.kind);
  const distance = run ? t - .82 * Math.sin(t * Math.PI * 2) / (Math.PI * 2) : t;
  const energy = run ? ease(t * 8) * ease((1 - t) * 6) : 1;
  return {distance, phase: distance * stepCount / 2, energy, running: run};
}

export function footfalls(action: Movement) {
  const frames = [];
  let previous = 0;
  for (let frame = action.frame; frame < action.frame + action.duration * fps; frame++) {
    const {phase} = gaitAt(action, frame);
    const contact = Math.floor(phase * 2 + 1e-8);
    if (contact > previous || (action.kind === 'walk' && frame === action.frame)) frames.push(frame);
    previous = contact;
  }
  return frames;
}
