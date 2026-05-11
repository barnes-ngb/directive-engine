/**
 * Arrow shrink tween: scalar interpolation used to fade/shrink deviation
 * arrows during the Apply animation.
 *
 * The output is a scale factor in [0, 1]. The arrow group's `.scale` is set
 * uniformly each frame, so a value of 0 fully hides the arrow; opacity can
 * be driven from the same factor by callers that need a parallel fade.
 */

import { easeInOutQuad, type Easing } from "./easing.js";

/** Default arrow shrink duration (ms). Slightly shorter than the panel tween. */
export const DEFAULT_ARROW_DURATION_MS = 600;

/** Below this scale, the arrow is effectively invisible — used to hide cleanly. */
export const ARROW_HIDE_THRESHOLD = 0.02;

/**
 * Sample the arrow scale at normalized time `t ∈ [0, 1]`.
 *
 * `from` and `to` should be in [0, 1]; common case is `from=1, to=0` (shrink).
 */
export function sampleArrowTween(
  from: number,
  to: number,
  t: number,
  easing: Easing = easeInOutQuad,
): number {
  const e = easing(t);
  return from + (to - from) * e;
}
