import type { Action, Step, Tolerances, Transform, Vec3 } from "../types.js";
import { add, norm, sub } from "../math/vec.js";
import { deltaQuat, multiply, toAxisAngle } from "../math/quat.js";

export interface PoseError {
  t_err_vec: Vec3;
  t_err_norm: number;
  rot_err_deg: number;
}

export interface SimulationResult {
  before: PoseError;
  after: PoseError;
  pass: boolean | null;
  reason?: string;
}

export function applyDeltaToPose(asBuiltPose: Transform, delta: Transform): Transform {
  return {
    translation_mm: add(asBuiltPose.translation_mm, delta.translation_mm),
    rotation_quat_xyzw: multiply(delta.rotation_quat_xyzw, asBuiltPose.rotation_quat_xyzw)
  };
}

export function computePoseError(nominalPose: Transform, pose: Transform): PoseError {
  const t_err_vec = sub(nominalPose.translation_mm, pose.translation_mm);
  const t_err_norm = norm(t_err_vec);
  const rot_delta = deltaQuat(nominalPose.rotation_quat_xyzw, pose.rotation_quat_xyzw);
  const { angleDeg } = toAxisAngle(rot_delta);
  return {
    t_err_vec,
    t_err_norm,
    rot_err_deg: angleDeg
  };
}

function stepIsNoop(step: Step): boolean {
  return step.actions.length === 0 || step.actions.every((action) => action.type === "noop");
}

function applyActions(asBuiltPose: Transform, actions: Action[]): Transform {
  return actions.reduce((pose, action) => {
    if (action.type === "noop" || !action.delta) return pose;
    return applyDeltaToPose(pose, {
      translation_mm: action.delta.translation_mm,
      rotation_quat_xyzw: action.delta.rotation_quat_xyzw
    });
  }, asBuiltPose);
}

function withinTolerances(error: PoseError, tolerances: Tolerances): boolean {
  return (
    error.t_err_norm <= tolerances.translation_mm + 1e-12 &&
    error.rot_err_deg <= tolerances.rotation_deg + 1e-12
  );
}

export function simulateStep(
  nominalPose: Transform,
  asBuiltPose: Transform,
  step: Step,
  tolerances: Tolerances
): SimulationResult {
  const before = computePoseError(nominalPose, asBuiltPose);

  if (step.status === "blocked" || step.status === "needs_review") {
    return { before, after: before, pass: false, reason: step.status };
  }

  if (stepIsNoop(step)) {
    return { before, after: before, pass: false, reason: "noop" };
  }

  const correctedPose = applyActions(asBuiltPose, step.actions);
  const after = computePoseError(nominalPose, correctedPose);
  const pass = withinTolerances(after, tolerances);

  return { before, after, pass };
}
