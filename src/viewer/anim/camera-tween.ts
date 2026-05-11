/**
 * Camera tween: interpolates a camera between two waypoints (position +
 * OrbitControls target) using `easeInOutQuad` by default.
 *
 * Pure math here — the runner in `src/viewer/anim/runner.ts` applies the
 * sampled state to the actual camera / controls each frame.
 */

import * as THREE from "three";
import { easeInOutQuad, type Easing } from "./easing.js";

export interface CameraWaypoint {
  /** Camera world-space position (mm). */
  position: THREE.Vector3;
  /** OrbitControls target (mm). */
  target: THREE.Vector3;
}

/** Default camera transition duration (ms). Matches Phase 3 calm tone. */
export const DEFAULT_CAMERA_DURATION_MS = 800;

/**
 * Sample the camera state at normalized time `t ∈ [0, 1]`.
 *
 * The result aliases newly-allocated Vector3s; callers may copy into existing
 * camera / target instances.
 */
export function sampleCameraTween(
  from: CameraWaypoint,
  to: CameraWaypoint,
  t: number,
  easing: Easing = easeInOutQuad,
): CameraWaypoint {
  const e = easing(t);
  return {
    position: new THREE.Vector3().lerpVectors(from.position, to.position, e),
    target: new THREE.Vector3().lerpVectors(from.target, to.target, e),
  };
}

/** Snapshot the current camera state into a fresh `CameraWaypoint`. */
export function snapshotCamera(
  camera: THREE.Camera,
  target: THREE.Vector3,
): CameraWaypoint {
  return {
    position: camera.position.clone(),
    target: target.clone(),
  };
}
