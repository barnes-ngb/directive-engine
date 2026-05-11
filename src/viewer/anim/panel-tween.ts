/**
 * Panel pose tween: slerp for rotation, lerp for translation. Used by beat-4
 * "Apply" to animate a panel from its as-built pose to the corrected pose.
 */

import * as THREE from "three";
import { easeInOutQuad, type Easing } from "./easing.js";
import type { PartPose } from "../load-fixture.js";

export interface PanelPoseState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** Default Apply animation duration (ms). */
export const DEFAULT_PANEL_DURATION_MS = 800;

export function poseToState(pose: PartPose): PanelPoseState {
  return {
    position: new THREE.Vector3(pose.t[0], pose.t[1], pose.t[2]),
    quaternion: new THREE.Quaternion(pose.q[0], pose.q[1], pose.q[2], pose.q[3]),
  };
}

/**
 * Sample the panel pose at normalized time `t ∈ [0, 1]`.
 *
 * Translation: linear interpolation (lerp).
 * Rotation: spherical linear interpolation (slerp) on the quaternion.
 * Easing is applied to the t parameter for both components so they progress
 * together.
 */
export function samplePanelTween(
  from: PanelPoseState,
  to: PanelPoseState,
  t: number,
  easing: Easing = easeInOutQuad,
): PanelPoseState {
  const e = easing(t);
  return {
    position: new THREE.Vector3().lerpVectors(from.position, to.position, e),
    quaternion: new THREE.Quaternion().slerpQuaternions(from.quaternion, to.quaternion, e),
  };
}
