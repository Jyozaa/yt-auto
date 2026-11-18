import {fps, type Scene, type Vec} from '../story/schema';
import type {Film, TimedWorldEvent} from '../story/timeline';
import {contactFrame} from '../story/world-events';
import {landingFrame} from '../story/prop-motion';
import {random, ramp, rate, tau, type Signal} from './design';

const foleyNames = ['rotary-motor', 'drill-bind', 'steel-strain', 'deck-impact', 'debris',
  'water-surge', 'mine-flood', 'mine-alarm', 'canal-flow', 'refill-wash', 'step-metal'] as const;
export type FoleyName = typeof foleyNames[number];
export type FoleyCue = {
  id: string; kind: FoleyName; frame: number; length: number; gain: number; at: Vec;
  origin: string; word: number; beat: number; phase: number;
};

export function worldFoley(film: Film): FoleyCue[] {
  const events = film.events ?? [];
  const binding = events.find(({kind}) => kind === 'bind');
  const reversed = events.find(({kind}) => kind === 'reverse');
  const world = events.flatMap((event): FoleyCue[] => {
    const say = (kind: FoleyName, frame: number, length: number, gain: number, phase = 0): FoleyCue => ({
      id: `${event.id}-${kind}`, origin: event.id, kind, frame, length, gain: gain * (event.amount ?? 1),
      at: event.at, word: event.word, beat: event.shot, phase
    });
    const {frame, length} = event;
    const contact = contactFrame(event);
    switch (event.kind) {
      case 'eddy': return [say('refill-wash', frame, length, .37)];
      case 'motor': return [say('rotary-motor', frame, binding ? contactFrame(binding) - frame + 13 : length, .69,
        binding ? contactFrame(binding) - frame : length)];
      case 'bind': return [say('drill-bind', contact, fps * 1.36, .94), say('steel-strain', frame, length, .70)];
      case 'drain': return [say('water-surge', frame, Math.max(length, (reversed?.frame ?? frame + length) - frame + 8), .57, length)];
      case 'collapse': return [
        say('steel-strain', frame, Math.max(fps * .6, contact - frame + 13), .93),
        say('deck-impact', contact, 2.5 * fps, 1),
        say('debris', contact + Math.round(.23 * fps), 2.6 * fps, .83)
      ];
      case 'flood': return [say('mine-flood', frame, length + fps * 1.3, .82), say('mine-alarm', frame, length, .32)];
      case 'explain': return [say('water-surge', frame, length, .48, length)];
      case 'reverse': return [say('canal-flow', frame, length + Math.round(1.5 * fps), .91)];
      case 'refill': return [say('refill-wash', frame, length, .57)];
    }
  });
  const landings = film.shots.flatMap((shot, beat) => shot.actions.flatMap((action, i): FoleyCue[] => {
    if (action.kind !== 'drop') return [];
    const wet = shot.scene.environment === 'lake' && action.to[1] < .28;
    return [{at: action.to, beat, id: `${action.target}-${beat}-landing-${i}`, origin: action.target, word: action.word,
      kind: wet ? 'debris' : 'step-metal', frame: landingFrame(action), length: wet ? 32 : 12,
      gain: wet ? .40 : .63, phase: 0}];
  }));
  return [...world, ...landings].sort((a, b) => a.frame - b.frame);
}

const oscillator = (frequency: number, time: number) => Math.sin(tau * frequency * time);
const bell = (t: number, base: number, decay: number) => ramp(t, .004) * Math.exp(-Math.max(0, t) * decay) *
  (.67 * oscillator(base, t) + .24 * oscillator(base * 2.21, t) + .09 * oscillator(base * 4.79, t));

export function foley(kind: FoleyName, seed: number, phase = 0): Signal {
  const noise = random(seed);
  let bottom = 0, mid = 0, grain = 0;
  return (t) => {
    const n = noise();
    bottom += .015 * (n - bottom);
    mid += .095 * (n - mid);
    grain += .29 * (n - grain);
    const grit = grain - mid, rush = .98 * mid + .55 * bottom;
    const pulsation = .5 + .5 * oscillator(6.2, t);
    const swell = ramp(t, .16);
    switch (kind) {
      case 'rotary-motor': {
        const braking = Math.min(.42, Math.max(0, t - phase / fps));
        // Matches the rotor's sampled angle and stops on the same deceleration curve.
        const travel = t - braking ** 2 / .84;
        const shaft = travel * .28 * fps / tau;
        const cycle = .52 + .48 * Math.sin(tau * 12 * shaft);
        return swell * (1 - braking / .42) *
          (.32 * rush + .47 * grit * cycle + .125 * Math.sin(tau * 28 * shaft) * cycle + .07 * Math.sin(tau * 48 * shaft));
      }
      case 'drill-bind':
        return (.70 * bell(t, 217, 7.8) + .43 * bell(t - .041, 483, 9) +
          .33 * grit * Math.exp(-t * 4.1)) + .27 * bottom * Math.exp(-t * 1.9);
      case 'steel-strain':
        return ramp(t, .08) * (.35 * grit + .29 * rush) * (.55 + .44 * oscillator(19, t * (1 + .49 * t))) +
          .1 * Math.sin(tau * (117 * t - 31 * t * t)) * Math.exp(-t * .72) * swell;
      case 'deck-impact':
        return .40 * bell(t, 52, 3.8) + .26 * bell(t - .026, 134, 6) + .19 * bell(t - .048, 204, 9.2) +
          (.48 * rush + .30 * grit) * ramp(t - .03, .026) * Math.exp(-t * 1.52);
      case 'debris': {
        const hit = (t + .014) % (.139 + Math.floor(t * 3) * .019);
        return .62 * bell(hit, 150 + 97 * Math.sin(Math.floor(t * 8) * 3) ** 2, 28) * Math.exp(-t * .71) +
          .38 * grit * Math.exp(-t * .88);
      }
      case 'water-surge':
        return rush * (.64 + .48 * ramp(t, Math.max(1, phase / fps))) * (.78 + .20 * pulsation) * swell + grit * .21 * swell;
      case 'mine-flood':
        return (.91 * rush + .21 * grit + bottom * .6) * ramp(t, .62) * (.70 + .29 * pulsation);
      case 'mine-alarm': {
        const call = t % .72;
        return (oscillator(471, t) * .24 + oscillator(617, t) * .37) * ramp(call, .047) * ramp(.31 - call, .09);
      }
      case 'canal-flow':
        return (.94 * mid + .34 * grit + .45 * bottom) * ramp(t, .48) * (.84 + .16 * oscillator(3.1, t));
      case 'refill-wash':
        return rush * (.68 + .30 * oscillator(.80, t)) * swell;
      case 'step-metal':
        return .45 * bell(t, 132, 23) + .18 * bell(t - .006, 531, 34) + grit * .40 * Math.exp(-t * 20);
    }
  };
}

export function ambience(environment: Scene['environment'], seed: number): Signal {
  const noise = random(seed);
  let breeze = 0, bed = 0, air = 0;
  return (t) => {
    const value = noise();
    air += .16 * (value - air);
    bed += .029 * (value - bed);
    breeze += .0024 * (air - breeze);
    if (environment === 'mine') return .93 * breeze + bed * .26 + air * .05;
    if (environment === 'cross-section') return bed * .18 + breeze * .4;
    const chirpTime = (t + seed % 19 / 11) % 3.71;
    const spark = chirpTime % .14;
    const bird = chirpTime < .38 ? ramp(spark, .017) * ramp(.088 - spark, .044) *
      Math.sin(tau * (1180 * spark + 1860 * spark ** 2)) * .067 : 0;
    return (.65 + .35 * oscillator(.29, t)) * (.70 * breeze + .38 * bed) + air * .12 + bird;
  };
}

export function spatialize(signal: Signal, cutoff: number, echo: number): Signal {
  const previous = new Float32Array(Math.round(rate * .039));
  const alpha = 1 - Math.exp(-tau * cutoff / rate);
  let low = 0, index = 0;
  return (t) => {
    low += (signal(t) - low) * alpha;
    const reflection = previous[index];
    previous[index] = low + reflection * .23;
    index = (index + 1) % previous.length;
    return low + reflection * echo;
  };
}
