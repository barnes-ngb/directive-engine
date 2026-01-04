/**
 * Simulation utilities for applying directives to poses.
 *
 * Provides functions to simulate the effect of applying directive steps
 * to as-built poses and verify the expected outcomes.
 */
import type { Action, Quat, Step, Tolerances, Transform, Vec3 } from "./types.js";
import { composeTransforms } from "./align/apply.js";
import { sub, norm, add } from "./math/vec.js";
import { deltaQuat, toAxisAngle, identity, multiply } from "./math/quat.js";
import { EPS_TOLERANCE } from "./constants.js";

export interface SimulateStepInput {
  nominalPose: Transform;
  asBuiltPose: Transform;
  step: Step;
  tolerances: Tolerances;
}

export interface SimulationResult {
  beforeError: {
    translation_mm_vec: Vec3;
    translation_norm_mm: number;
    rotation_deg: number;
  };
  directiveDelta: {
    translation_mm_vec: Vec3;
    rotation_quat_xyzw: Quat;
    rotation_deg: number;
  } | null;
  afterError: {
    translation_mm_vec: Vec3;
    translation_norm_mm: number;
    rotation_deg: number;
  };
  pass: boolean;
  canSimulate: boolean;
}

/**
 * Compute the combined delta transform from all actions in a step.
 */
function computeCombinedDelta(actions: Action[]): Transform {
  let combined: Transform = {
    translation_mm: [0, 0, 0],
    rotation_quat_xyzw: identity()
  };

  for (const action of actions) {
    if (action.type === "noop" || !action.delta) continue;

    const actionTransform: Transform = {
      translation_mm: action.delta.translation_mm,
      rotation_quat_xyzw: action.delta.rotation_quat_xyzw
    };

    // Combine: apply action after current combined transform
    combined = {
      translation_mm: add(combined.translation_mm, actionTransform.translation_mm),
      rotation_quat_xyzw: multiply(actionTransform.rotation_quat_xyzw, combined.rotation_quat_xyzw)
    };
  }

  return combined;
}

/**
 * Apply a delta transform to an as-built pose.
 * The delta represents the correction to apply: new_pose = delta * as_built
 * For translation: new_t = as_built_t + delta_t (delta in world frame)
 * For rotation: new_q = delta_q * as_built_q
 */
function applyDeltaToPose(asBuiltPose: Transform, delta: Transform): Transform {
  return {
    translation_mm: add(asBuiltPose.translation_mm, delta.translation_mm),
    rotation_quat_xyzw: multiply(delta.rotation_quat_xyzw, asBuiltPose.rotation_quat_xyzw)
  };
}

/**
 * Compute errors between nominal and a given pose.
 */
function computeErrors(nominalPose: Transform, pose: Transform) {
  const translationError = sub(nominalPose.translation_mm, pose.translation_mm);
  const translationNorm = norm(translationError);
  const rotationDelta = deltaQuat(nominalPose.rotation_quat_xyzw, pose.rotation_quat_xyzw);
  const { angleDeg } = toAxisAngle(rotationDelta);
  return {
    translation_mm_vec: translationError,
    translation_norm_mm: translationNorm,
    rotation_deg: angleDeg
  };
}

/**
 * Check if errors are within tolerances.
 */
function withinTolerances(
  translationNorm: number,
  rotationDeg: number,
  tolerances: Tolerances
): boolean {
  return (
    translationNorm <= tolerances.translation_mm + EPS_TOLERANCE &&
    rotationDeg <= tolerances.rotation_deg + EPS_TOLERANCE
  );
}

/**
 * Simulate applying a directive step's actions to an as-built pose.
 * Returns the before/after errors and whether the result passes tolerances.
 *
 * Note: blocked and needs_review statuses cannot be simulated (canSimulate = false).
 */
export function simulateStep(input: SimulateStepInput): SimulationResult {
  const { nominalPose, asBuiltPose, step, tolerances } = input;

  // Compute before errors
  const beforeError = computeErrors(nominalPose, asBuiltPose);

  // Check if simulation is possible
  const canSimulate = step.status !== "blocked" && step.status !== "needs_review";

  if (!canSimulate) {
    // Return before errors as after errors (no change)
    return {
      beforeError,
      directiveDelta: null,
      afterError: beforeError,
      pass: false,
      canSimulate: false
    };
  }

  // Compute combined delta from all actions
  const combinedDelta = computeCombinedDelta(step.actions);

  // Get rotation angle for the delta
  const { angleDeg: deltaRotationDeg } = toAxisAngle(combinedDelta.rotation_quat_xyzw);

  const directiveDelta = {
    translation_mm_vec: combinedDelta.translation_mm,
    rotation_quat_xyzw: combinedDelta.rotation_quat_xyzw,
    rotation_deg: deltaRotationDeg
  };

  // Apply delta to as-built pose
  const correctedPose = applyDeltaToPose(asBuiltPose, combinedDelta);

  // Compute after errors
  const afterError = computeErrors(nominalPose, correctedPose);

  // Check if within tolerances
  const pass = withinTolerances(
    afterError.translation_norm_mm,
    afterError.rotation_deg,
    tolerances
  );

  return {
    beforeError,
    directiveDelta,
    afterError,
    pass,
    canSimulate: true
  };
}
