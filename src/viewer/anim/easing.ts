/**
 * Easing functions for animations. Pure math; no Three.js dependency so they
 * can be unit-tested without a WebGL context.
 *
 * Inputs are clamped to [0, 1] internally so callers don't need to guard t.
 */

export type Easing = (t: number) => number;

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/** Linear identity easing. */
export const linear: Easing = (t) => clamp01(t);

/**
 * Quadratic ease in/out — slow start, fast middle, slow end. Default for the
 * demo: matches the "calm/considered" tone declared in the Phase 3 plan.
 */
export const easeInOutQuad: Easing = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
