import type {CueKind, Beat, Scene} from '../story/schema';

export const rate = 48_000;
export const tau = Math.PI * 2;
export const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
export const ramp = (t: number, a: number) => Math.max(0, Math.min(1, t / a));
export type Signal = (t: number) => number;

export function random(seed: number) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
}

const modes = (frequencies: number[], t: number, decay: number) => frequencies.reduce((sum, frequency, i) =>
  sum + Math.sin(tau * frequency * t) * Math.exp(-t * (decay + i * 5)) / (i + 1), 0) / 1.7;

export const instruments = {
  felt: (f: number): Signal => (t) => ramp(t, .009) * modes([f, f * 2.003, f * 3.004], t, 2.9),
  bass: (f: number): Signal => (t) => ramp(t, .017) * modes([f, f * 2, f * 3], t, 4.0),
  bells: (f: number): Signal => (t) => ramp(t, .012) * modes([f, f * 2.34, f * 3.94], t, 4.8),
  strings: (f: number): Signal => (t) => ramp(t, .26) * Math.exp(-t * .58) *
    (.49 * Math.sin(tau * f * t) + .18 * Math.sin(tau * f * 1.002 * t) + .13 * Math.sin(tau * f * 2.002 * t)),
  reed: (f: number): Signal => (t) => ramp(t, .045) * Math.exp(-t * 1.9) *
    (.63 * Math.sin(tau * f * t + .38 * Math.sin(tau * 4.6 * t)) + .18 * Math.sin(tau * f * 3.0 * t))
};

type Arrangement = {
  root: number; step: number; pattern: (number | null)[]; voice: keyof typeof instruments; sustain: number;
};
export const arrangements: Record<Beat['role'], Arrangement> = {
  hook: {root: 50, step: .51, pattern: [0, null, 7, 3, null, 10], voice: 'felt', sustain: 1.0},
  setting: {root: 46, step: .40, pattern: [7, 12, null, 10, 7, 5, null, 3], voice: 'reed', sustain: .55},
  escalation: {root: 50, step: .34, pattern: [0, null, 3, 7, 12, 10, 7, 3], voice: 'felt', sustain: .52},
  turn: {root: 45, step: .62, pattern: [0, null, null, 7, null, 13], voice: 'strings', sustain: 1.6},
  analogy: {root: 53, step: .43, pattern: [4, 7, 12, null, 11, 7, 2, 7], voice: 'bells', sustain: .95},
  consequence: {root: 48, step: .51, pattern: [4, 9, null, 7, 12, null, 14, 12], voice: 'reed', sustain: .85},
  payoff: {root: 50, step: .52, pattern: [0, null, 7, 3, null, 12], voice: 'felt', sustain: .94}
};

// Lake score: an unresolved three-note motif returns in the refilled basin.
// Shorter phrases and spaces around contact leave room for the water and metal.
export const kineticArrangements: Record<Beat['role'], Arrangement> = {
  hook: {root: 48, step: .64, pattern: [0, null, 7, null, 3, null, null, null], voice: 'felt', sustain: 1.2},
  setting: {root: 48, step: .53, pattern: [0, 7, null, 3, null, 7, 10, null], voice: 'felt', sustain: .88},
  escalation: {root: 48, step: .41, pattern: [0, null, 3, null, 6, null, null, 7], voice: 'reed', sustain: .65},
  turn: {root: 45, step: .65, pattern: [0, null, null, null, 3, null, null, null], voice: 'strings', sustain: 1.6},
  analogy: {root: 48, step: .63, pattern: [0, null, 7, null, 3, null, 10, null], voice: 'felt', sustain: .93},
  consequence: {root: 48, step: .51, pattern: [0, null, 7, 9, 4, null, 10, 7], voice: 'reed', sustain: .91},
  payoff: {root: 48, step: .64, pattern: [0, null, 7, null, 4, null, null, null], voice: 'felt', sustain: 1.2}
};

type Effect = {length: number; signal: Signal};
export function sound(kind: CueKind, seed: number): Effect {
  const noise = random(seed);
  let slow = 0;
  const air = () => {
    slow += .15 * (noise() - slow);
    return slow;
  };
  switch (kind) {
    case 'step':
    case 'step-stone':
    case 'step-wood':
    case 'step-earth': {
      const base = kind === 'step-wood' ? 126 : kind === 'step-earth' ? 71 : 94;
      return {length: .23, signal: (t) =>
        ramp(t, .005) * Math.exp(-17 * t) * (.66 * Math.sin(tau * (base - t * 80) * t) + .44 * air())
        + .19 * ramp(t - .04, .018) * Math.exp(-27 * Math.max(0, t - .06)) * noise()};
    }
    case 'impact':
    case 'wood-hit':
    case 'metal-hit':
    case 'stone-hit': {
      const resonances = kind === 'metal-hit' ? [465, 971, 1710, 2180] :
        kind === 'stone-hit' ? [210, 455, 686] : kind === 'wood-hit' ? [132, 251, 443] : [67, 112, 176];
      return {length: kind === 'metal-hit' ? .88 : .41, signal: (t) =>
        ramp(t, .003) * (modes(resonances, t, kind === 'metal-hit' ? 6 : 13) + .24 * air() * Math.exp(-16 * t))};
    }
    case 'door':
    case 'creak':
    case 'machine':
    case 'snap': {
      const length = kind === 'snap' ? .24 : kind === 'machine' ? 1.1 : .73;
      return {length, signal: (t) => {
        const pulses = Math.pow(.5 + .5 * Math.sin(tau * (19 * t + 9 * t * t)), 3);
        const rub = (air() * .43 + modes([178, 410, 760], t % .052, 24) * .43) * pulses;
        const slam = kind === 'door' || kind === 'snap' ? modes([102, 179, 275], Math.max(0, t - .13), 24) *
          ramp(t - .13, .004) : 0;
        return (rub + slam) * ramp(t, .025) * ramp(length - t, .08);
      }};
    }
    case 'scrape':
    case 'wind':
    case 'whoosh':
    case 'splash': {
      const length = kind === 'wind' ? 1.2 : kind === 'splash' ? .83 : kind === 'scrape' ? .43 : .57;
      return {length, signal: (t) => {
        const drive = Math.sin(Math.PI * t / length) ** 2;
        const grit = kind === 'scrape' ? 1 + .54 * Math.sin(tau * (37 * t + 19 * t * t)) : 1;
        const water = kind === 'splash' ? modes([420, 631, 810], (t * (1 + t)) % .049, 20) * .17 : 0;
        return drive * grit * (.7 * air() + .28 * noise() + water);
      }};
    }
    case 'chime':
    case 'reaction': {
      const length = kind === 'reaction' ? .46 : .76;
      return {length, signal: (t) => ramp(t, .006) * ramp(length - t, .08) *
        (kind === 'reaction' ? Math.sin(tau * (590 * t - 280 * t * t + 9 * t ** 3)) * Math.exp(-6 * t) :
          modes([659, 1131, 1584], t, 6.4))};
    }
  }
}

export function room(environment: Scene['environment'], seed: number): Signal {
  const noise = random(seed);
  let low = 0, softer = 0;
  return (t) => {
    low += .036 * (noise() - low);
    softer += .004 * (low - softer);
    if (environment === 'diagram') return softer * .38;
    if (environment === 'terrace' || environment === 'street') return low * (.35 + .26 * Math.sin(t * 1.7));
    return softer * .35 + .08 * Math.sin(tau * 65.7 * t) * (.7 + .3 * Math.sin(t * 2.1));
  };
}
