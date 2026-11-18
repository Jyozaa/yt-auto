import {fps} from './schema';
import type {TimedWorldEvent} from './timeline';

const fastTravel = (t: number) => {
  const u = clamp(t);
  return u ** 3 - .5 * u ** 4 + Math.max(0, t - 1);
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export const contactFrame = (event: TimedWorldEvent) =>
  event.frame + Math.round(event.length * (event.kind === 'collapse' ? .42 : event.kind === 'bind' ? .21 : 0));

export function worldAt(events: readonly TimedWorldEvent[], frame: number) {
  let eddy = 0, rotation = 0, strain = 0, drain = 0, lean = 0, sink = 0, flood = 0, throat = 0;
  let reversal = 0, refill = 0, swirl = 0, collision = 0;
  let canalTravel = -1.5 * frame / fps, alarm = false;
  const bind = events.find(({kind}) => kind === 'bind');
  for (const event of events) {
    if (frame < event.frame) break;
    const elapsed = frame - event.frame;
    const t = elapsed / event.length;
    const amount = event.amount ?? 1;
    switch (event.kind) {
      case 'eddy':
        eddy += amount * ease(t * 3) * (1 - ease((t - .45) / .55));
        break;
      case 'motor': {
        const until = bind ? contactFrame(bind) : event.frame + event.length;
        const brake = bind ? Math.round(.42 * fps) : 0;
        const slowing = Math.min(brake, Math.max(0, frame - until));
        const revolutions = Math.min(frame, until) - event.frame;
        rotation += (revolutions + slowing * (1 - slowing / (2 * (brake || 1)))) * .28 * amount;
        break;
      }
      case 'bind':
        strain += amount * ease(t * 7) * (1 - ease((t - .18) / .82));
        break;
      case 'drain':
        drain = Math.min(1, drain + ease(t) * amount);
        swirl += elapsed / fps * amount * (.48 + .13 * ease(t));
        break;
      case 'collapse': {
        const contact = contactFrame(event);
        lean = Math.max(lean, ease(elapsed / (contact - event.frame)) * amount);
        sink = Math.max(sink, ease((frame - contact) / (event.frame + event.length - contact)) * amount);
        collision += Math.max(0, 1 - Math.abs(frame - contact) / 17) * amount;
        break;
      }
      case 'flood':
        flood = Math.max(flood, ease(t) * amount);
        alarm ||= t < 1 && (elapsed / fps) % .72 < .31;
        break;
      case 'explain':
        throat = Math.max(throat, ease(t) * amount);
        break;
      case 'reverse':
        reversal = Math.max(reversal, ease(t * 2) * amount);
        canalTravel += 6.6 * amount * event.length / (2 * fps) * fastTravel(t * 2);
        break;
      case 'refill':
        refill = Math.max(refill, ease(t) * amount);
        break;
    }
  }
  const vortex = Math.max(eddy, drain * (1 - refill));
  return {alarm, canalTravel, rotation, strain, drain, lean, sink, flood, throat, reversal, refill, swirl, vortex, collision,
    level: -2.25 * drain * (1 - refill)};
}

export type WorldState = ReturnType<typeof worldAt>;
