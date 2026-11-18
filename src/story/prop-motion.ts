import {fps, type Vec} from './schema';
import type {TimedAction} from './timeline';
import {ease} from './world-events';

export const isTransfer = (action: TimedAction) => action.kind === 'lift' || action.kind === 'drop';
export const landingFrame = (action: TimedAction) => action.frame + Math.round(action.duration * fps);

export function propAt(from: Vec, actions: readonly TimedAction[], frame: number): Vec {
  let at = from;
  for (const action of actions) {
    if (frame < action.frame) break;
    if (!('to' in action) || !isTransfer(action)) continue;
    const end = landingFrame(action);
    if (frame >= end) {
      at = action.to;
      continue;
    }
    const t = (frame - action.frame) / (end - action.frame);
    const fall = action.kind === 'drop';
    at = at.map((start, axis) => start + (action.to[axis] - start) *
      (fall ? axis === 1 ? t * t : 1 - (1 - t) ** 2 : ease(t))) as Vec;
    break;
  }
  return at;
}
