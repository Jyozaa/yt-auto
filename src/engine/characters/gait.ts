export const stepsPerSecond = 2.8;

export function gaitFoot(cycle: number, side: number) {
  const phase = (cycle + (side > 0 ? .5 : 0)) % 1;
  const swing = Math.max(0, (phase - .59) / .41);
  const smooth = swing * swing * (3 - 2 * swing);
  return {
    reach: phase < .59 ? 1 - 2 * phase / .59 : -1 + 2 * smooth,
    lift: Math.sin(swing * Math.PI)
  };
}
