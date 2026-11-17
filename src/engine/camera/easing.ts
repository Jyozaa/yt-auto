// Smootherstep from the bridge story.ts. Copyright (c) 2026 Mr omi. See docs/LICENSE-MR-OMI.
export const glide = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * x * (x * (6 * x - 15) + 10);
};
