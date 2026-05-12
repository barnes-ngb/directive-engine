/**
 * Camera framing math for the 5-beat walkthrough.
 *
 * Pure functions: given a world-space AABB and the current camera (FOV +
 * aspect), return the camera position needed to frame the AABB with a
 * configurable padding factor. The caller drives where the result lands
 * (snap at mount, tween between beats, re-snap on resize).
 *
 * Phase 6 replaces the Phase 1/4 heuristics: hardcoded `radius = max(span)
 * * k + offset` with `aspectFactor` multipliers. Those heuristics work for
 * the original 2-panel fixture but break as the scene's true AABB grows.
 * Everything here derives from the rendered geometry's AABB and the
 * viewport's actual FOV.
 */

import * as THREE from "three";

/**
 * Default view direction (target → camera) — front-right, mild downward
 * tilt. Phase 1 used `(0.7, 0.4, 0.7)` for the default and `(0.55, 0.35,
 * 0.85)` for close-ups. We pick one direction and share it everywhere so
 * the eye doesn't jump between beats. `(0.55, 0.35, 0.85).normalize()`
 * reads as "facing roughly straight on, slightly above, slightly to the
 * right."
 */
export const DEFAULT_VIEW_DIRECTION: THREE.Vector3 = new THREE.Vector3(
  0.55,
  0.35,
  0.85,
).normalize();

/** Padding factors per beat — multiplicative on the fit distance. */
export const WIDE_SHOT_PADDING = 1.25;
export const CLOSE_SHOT_PADDING = 1.15;

/**
 * Padding multiplier applied when the viewport is portrait (aspect < 1).
 *
 * On mobile portrait the canvas region is itself portrait (60dvh of a
 * 393×852-class device → ~393×511, aspect ~0.77). The bounding-sphere fit
 * already has to pull back to keep the wider-than-tall facade inside the
 * narrow horizontal FOV, so any value > 1 here is double padding and leaves
 * a wide grey margin around the facade.
 *
 * Phase 6c flipped this from 1.2 → 0.82: on the narrowest portrait aspect
 * we multiply the per-beat padding by ~0.82, ramping to 1.0 (no effect) at
 * aspect 1.0. Net result: facade fills ~70-75% of canvas width on phones
 * while keeping enough margin that no panel touches the canvas edge.
 *
 * Landscape (aspect ≥ 1) short-circuits and uses the base padding unchanged.
 */
export const PORTRAIT_PADDING_FACTOR = 0.82;

/**
 * Compute the effective padding for a given aspect ratio. On portrait
 * (aspect < 1), scales the base padding by `PORTRAIT_PADDING_FACTOR`; ramps
 * linearly between aspect 1.0 (no change) and aspect 0.5 (full scale) so a
 * square viewport gets a gentler nudge than an iPhone portrait. On
 * landscape, returns the base padding unchanged.
 */
export function paddingForAspect(basePadding: number, aspect: number): number {
  if (aspect >= 1) return basePadding;
  const t = Math.min(1, Math.max(0, (1 - aspect) / 0.5));
  return basePadding * (1 + (PORTRAIT_PADDING_FACTOR - 1) * t);
}

/**
 * Distance from a sphere-bounded target needed to keep that sphere fully
 * inside both vertical and horizontal FOV.
 *
 *   tan(vFOV/2) = bboxRadius / distance   →  distance = bboxRadius / tan(vFOV/2)
 *   tan(hFOV/2) = aspect · tan(vFOV/2)    →  distance = bboxRadius / (aspect · tan(vFOV/2))
 *
 * Use the smaller of the two tangents to guarantee both bounds are
 * respected, then scale by `padding` (1.15 = 15% extra room).
 */
export function fitDistance(
  bboxRadius: number,
  fovVerticalDeg: number,
  aspect: number,
  padding: number,
): number {
  const halfV = THREE.MathUtils.degToRad(fovVerticalDeg) / 2;
  const tanV = Math.tan(halfV);
  const tanH = aspect * tanV;
  const limit = Math.min(tanV, tanH);
  if (limit <= 1e-9) return bboxRadius * 10; // degenerate viewport, bail
  return (bboxRadius / limit) * padding;
}

export interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Compute camera position + target that frames `bbox` with the given
 * padding. The target is the AABB centre; the position is along
 * `viewDirection` at the fit distance.
 */
export function frameBox(
  bbox: THREE.Box3,
  fovVerticalDeg: number,
  aspect: number,
  padding: number = CLOSE_SHOT_PADDING,
  viewDirection: THREE.Vector3 = DEFAULT_VIEW_DIRECTION,
): Framing {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);
  // Bounding-sphere radius (half-diagonal). Conservative; guarantees the
  // AABB fits even when oriented at the worst angle to the view plane.
  const radius = size.length() / 2;
  const distance = fitDistance(radius, fovVerticalDeg, aspect, padding);
  const dir = viewDirection.clone().normalize();
  return {
    position: center.clone().addScaledVector(dir, distance),
    target: center,
  };
}

/** World-space AABB of a single object, including all descendants. */
export function objectWorldBox(obj: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(obj);
}

/** Union of world-space AABBs across a set of objects. */
export function unionWorldBox(objs: Iterable<THREE.Object3D>): THREE.Box3 {
  const out = new THREE.Box3().makeEmpty();
  for (const o of objs) {
    out.union(new THREE.Box3().setFromObject(o));
  }
  return out;
}

/**
 * Expand a focus AABB to include neighbouring context — used for the
 * beat-2/3/4 close-up so the focused panel doesn't fill the frame entirely
 * (we want to see immediate neighbours for spatial context).
 *
 * Scaling by ~2.2× on the dominant dimension brings adjacent panels into
 * frame for a 1500-mm-wide panel inside a 4600-mm-wide grid.
 */
export function expandForContext(
  bbox: THREE.Box3,
  contextScale: number,
): THREE.Box3 {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);
  size.multiplyScalar(contextScale);
  const half = size.clone().multiplyScalar(0.5);
  return new THREE.Box3(
    center.clone().sub(half),
    center.clone().add(half),
  );
}
