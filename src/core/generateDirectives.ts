/**
 * Core directive generation engine.
 *
 * Converts construction/assembly deviations (as-built poses vs. nominal specifications)
 * into field-executable directives with translation and rotation corrections.
 */
import type {
  Action,
  AsBuiltPartPose,
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPartPose,
  NominalPosesDataset,
  PartConstraint,
  ReasonCodeType,
  Status,
  Step,
  TransformDelta,
  Vec3,
  Verification
} from "./types.js";
import { ReasonCode } from "./types.js";
import { sub, norm, clampVecPerAxis } from "./math/vec.js";
import { deltaQuat, identity as qIdent, toAxisAngle, clampQuatAngle } from "./math/quat.js";
import { EPS, EPS_TOLERANCE } from "./constants.js";
import { TimestampError } from "./errors.js";

// ============================================================================
// Helper Types
// ============================================================================

interface ComputedErrorsInternal {
  tErr: Vec3;
  tErrNorm: number;
  qErr: [number, number, number, number];
  rErrDeg: number;
  rAxis: Vec3;
}

interface ActionGenerationContext {
  partName: string;
  constraint: PartConstraint;
  errors: ComputedErrorsInternal;
  actionCounter: { value: number };
}

interface ActionGenerationResult {
  actions: Action[];
  reasons: ReasonCodeType[];
  status: Status;
  appliedTranslation: Vec3;
  residualRotationDeg: number;
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

function zeros(): Vec3 {
  return [0, 0, 0];
}

function maskTranslation(v: Vec3, mask: { x: boolean; y: boolean; z: boolean }): Vec3 {
  return [
    mask.x ? v[0] : 0,
    mask.y ? v[1] : 0,
    mask.z ? v[2] : 0
  ];
}

function pickRotationAxis(mask: { x: boolean; y: boolean; z: boolean }): "x" | "y" | "z" | undefined {
  if (mask.x) return "x";
  if (mask.y) return "y";
  if (mask.z) return "z";
  return undefined;
}

function dominantAxis(allowed: { x: boolean; y: boolean; z: boolean }, axis: Vec3): "x" | "y" | "z" | undefined {
  const candidates: Array<["x" | "y" | "z", number]> = [];
  if (allowed.x) candidates.push(["x", Math.abs(axis[0])]);
  if (allowed.y) candidates.push(["y", Math.abs(axis[1])]);
  if (allowed.z) candidates.push(["z", Math.abs(axis[2])]);
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

function withinTol(tNorm: number, rDeg: number, tol: { translation_mm: number; rotation_deg: number }): boolean {
  return tNorm <= tol.translation_mm + EPS_TOLERANCE && rDeg <= tol.rotation_deg + EPS_TOLERANCE;
}

function makeDelta(translation_mm: Vec3, rotation_quat_xyzw: [number, number, number, number]): TransformDelta {
  return { translation_mm, rotation_quat_xyzw };
}

function computeExpectedResidual(originalTErr: Vec3, appliedTranslation: Vec3): Vec3 {
  return [
    originalTErr[0] - appliedTranslation[0],
    originalTErr[1] - appliedTranslation[1],
    originalTErr[2] - appliedTranslation[2]
  ];
}

function verificationTypeForConstraint(c: PartConstraint): Verification["type"] {
  return c.verification?.method ?? "measure_pose";
}

function expectedResultForStatus(status: Status): Verification["expected_result"] {
  if (status === "blocked") return "expected_fail";
  if (status === "needs_review") return "unknown";
  return "expected_pass";
}

/**
 * Add seconds to an ISO timestamp string.
 * @throws TimestampError if the input is not a valid ISO timestamp
 */
function addSecondsIso(iso: string, seconds: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new TimestampError(`Invalid ISO timestamp: "${iso}"`, iso);
  }
  return new Date(t + seconds * 1000).toISOString();
}

/**
 * Compute translation and rotation errors between nominal and as-built poses.
 */
function computeErrors(
  nominalT: { translation_mm: Vec3; rotation_quat_xyzw: [number, number, number, number] },
  asBuiltT: { translation_mm: Vec3; rotation_quat_xyzw: [number, number, number, number] }
): ComputedErrorsInternal {
  const tErr = sub(nominalT.translation_mm, asBuiltT.translation_mm);
  const tErrNorm = norm(tErr);
  const qErr = deltaQuat(nominalT.rotation_quat_xyzw, asBuiltT.rotation_quat_xyzw);
  const { axis: rAxis, angleDeg: rErrDeg } = toAxisAngle(qErr);
  return { tErr, tErrNorm, qErr, rErrDeg, rAxis };
}

// ============================================================================
// Step Generation Functions
// ============================================================================

/**
 * Create a step for missing input data (no as-built or constraints).
 */
function createMissingDataStep(
  stepId: string,
  partId: string,
  poseConfidence: number | undefined,
  actionCounter: { value: number },
  verificationCounter: { value: number }
): Step {
  return {
    step_id: stepId,
    part_id: partId,
    status: "needs_review",
    reason_codes: [ReasonCode.MISSING_INPUT_DATA],
    pose_confidence: poseConfidence,
    computed_errors: {
      translation_error_mm_vec: zeros(),
      translation_error_norm_mm: 0,
      rotation_error_deg: 0
    },
    actions: [{
      action_id: `A${actionCounter.value++}`,
      type: "noop",
      description: "Missing nominal/as-built/constraints input. Cannot issue directive."
    }],
    verification: [{
      verification_id: `V${verificationCounter.value++}`,
      type: "re_scan",
      acceptance: { translation_mm: 0, rotation_deg: 0 },
      expected_residual: { translation_mm_vec: zeros(), rotation_deg: 0 },
      expected_result: "unknown",
      notes: "Resolve missing inputs."
    }]
  };
}

/**
 * Create a step for low confidence pose (below threshold).
 */
function createLowConfidenceStep(
  stepId: string,
  partId: string,
  poseConfidence: number,
  errors: ComputedErrorsInternal,
  constraint: PartConstraint,
  actionCounter: { value: number },
  verificationCounter: { value: number }
): Step {
  const vType = verificationTypeForConstraint(constraint);
  return {
    step_id: stepId,
    part_id: partId,
    status: "needs_review",
    reason_codes: [ReasonCode.LOW_CONFIDENCE],
    pose_confidence: poseConfidence,
    computed_errors: {
      translation_error_mm_vec: errors.tErr,
      translation_error_norm_mm: errors.tErrNorm,
      rotation_error_deg: errors.rErrDeg
    },
    actions: [{
      action_id: `A${actionCounter.value++}`,
      type: "noop",
      description: "Do not move part: pose confidence below threshold. Request re-scan.",
      delta: makeDelta(zeros(), qIdent())
    }],
    verification: [{
      verification_id: `V${verificationCounter.value++}`,
      type: vType === "measure_pose" ? "re_scan" : vType,
      acceptance: {
        translation_mm: constraint.tolerances.translation_mm,
        rotation_deg: constraint.tolerances.rotation_deg
      },
      expected_residual: { translation_mm_vec: errors.tErr, rotation_deg: errors.rErrDeg },
      expected_result: "unknown",
      notes: constraint.verification?.notes ?? "Re-scan to improve confidence before issuing motion directives."
    }]
  };
}

/**
 * Create a step for a part already within tolerance.
 */
function createWithinToleranceStep(
  stepId: string,
  partId: string,
  poseConfidence: number,
  errors: ComputedErrorsInternal,
  constraint: PartConstraint,
  actionCounter: { value: number },
  verificationCounter: { value: number }
): Step {
  return {
    step_id: stepId,
    part_id: partId,
    status: "ok",
    reason_codes: [ReasonCode.WITHIN_TOLERANCE],
    pose_confidence: poseConfidence,
    computed_errors: {
      translation_error_mm_vec: errors.tErr,
      translation_error_norm_mm: errors.tErrNorm,
      rotation_error_deg: errors.rErrDeg
    },
    actions: [{
      action_id: `A${actionCounter.value++}`,
      type: "noop",
      description: "No adjustment required; as-built pose is within tolerance.",
      delta: makeDelta(zeros(), qIdent())
    }],
    verification: [{
      verification_id: `V${verificationCounter.value++}`,
      type: verificationTypeForConstraint(constraint),
      acceptance: {
        translation_mm: constraint.tolerances.translation_mm,
        rotation_deg: constraint.tolerances.rotation_deg
      },
      expected_residual: { translation_mm_vec: zeros(), rotation_deg: 0 },
      expected_result: "expected_pass",
      notes: constraint.verification?.notes
    }]
  };
}

/**
 * Create a step for a blocked part (exceeds max norm).
 */
function createBlockedStep(
  stepId: string,
  partId: string,
  poseConfidence: number,
  errors: ComputedErrorsInternal,
  constraint: PartConstraint,
  verificationCounter: { value: number }
): Step {
  return {
    step_id: stepId,
    part_id: partId,
    status: "blocked",
    reason_codes: [ReasonCode.OUTSIDE_LIMITS_BLOCKED, ReasonCode.TRANSLATION_EXCEEDS_MAX_NORM],
    pose_confidence: poseConfidence,
    computed_errors: {
      translation_error_mm_vec: errors.tErr,
      translation_error_norm_mm: errors.tErrNorm,
      rotation_error_deg: errors.rErrDeg
    },
    actions: [],
    verification: [{
      verification_id: `V${verificationCounter.value++}`,
      type: verificationTypeForConstraint(constraint),
      acceptance: {
        translation_mm: constraint.tolerances.translation_mm,
        rotation_deg: constraint.tolerances.rotation_deg
      },
      expected_residual: { translation_mm_vec: errors.tErr, rotation_deg: errors.rErrDeg },
      expected_result: "expected_fail",
      notes: constraint.verification?.notes ??
        `Required translation exceeds translation_max_norm_mm=${constraint.translation_max_norm_mm}; do not attempt correction; escalate.`
    }]
  };
}

// ============================================================================
// Action Generation Functions
// ============================================================================

/**
 * Generate a translation action if translation error exceeds tolerance.
 */
function generateTranslationAction(
  ctx: ActionGenerationContext,
  clampPolicy: string | undefined
): { action: Action | null; reasons: ReasonCodeType[]; clamped: boolean; appliedTranslation: Vec3 } {
  const { partName, constraint, errors, actionCounter } = ctx;
  const reasons: ReasonCodeType[] = [];

  if (errors.tErrNorm <= constraint.tolerances.translation_mm + EPS) {
    return { action: null, reasons: [], clamped: false, appliedTranslation: zeros() };
  }

  reasons.push(ReasonCode.TRANSLATION_OUT_OF_TOLERANCE);

  const masked = maskTranslation(errors.tErr, constraint.allowed_translation_axes);
  let deltaT = masked;
  let clampApplied = false;
  let originalDelta: TransformDelta | undefined;

  if (constraint.translation_max_abs_mm && (clampPolicy ?? "per_axis_max_abs") === "per_axis_max_abs") {
    const maxAbs: Vec3 = [
      constraint.translation_max_abs_mm.x,
      constraint.translation_max_abs_mm.y,
      constraint.translation_max_abs_mm.z
    ];
    const res = clampVecPerAxis(masked, maxAbs);
    deltaT = res.clamped;
    clampApplied = res.changed;
    if (clampApplied) {
      originalDelta = makeDelta(masked, qIdent());
    }
  }

  if (clampApplied) {
    reasons.push(ReasonCode.CLAMPED_TO_LIMITS, ReasonCode.TRANSLATE_CLAMPED);
  } else {
    reasons.push(ReasonCode.TRANSLATE_ONLY);
  }

  const desc = clampApplied
    ? `Translate ${partName} toward nominal but clamp to per-axis max abs limits.`
    : `Translate ${partName} to nominal (rotation locked). Apply delta in world frame.`;

  const action: Action = {
    action_id: `A${actionCounter.value++}`,
    type: "translate",
    description: desc,
    delta: makeDelta(deltaT, qIdent()),
    clamp_applied: clampApplied,
    original_delta: originalDelta
  };

  return { action, reasons, clamped: clampApplied, appliedTranslation: deltaT };
}

/**
 * Generate a rotation action if rotation error exceeds tolerance.
 */
function generateRotationAction(
  ctx: ActionGenerationContext
): { action: Action | null; reasons: ReasonCodeType[]; clamped: boolean; blocked: boolean; residualRotationDeg: number } {
  const { partName, constraint, errors, actionCounter } = ctx;
  const reasons: ReasonCodeType[] = [];

  if (errors.rErrDeg <= constraint.tolerances.rotation_deg + EPS) {
    return { action: null, reasons: [], clamped: false, blocked: false, residualRotationDeg: errors.rErrDeg };
  }

  reasons.push(ReasonCode.ROTATION_OUT_OF_TOLERANCE);

  if (constraint.rotation_mode === "index") {
    // Validate that index_rotation config is present
    if (!constraint.index_rotation) {
      reasons.push(ReasonCode.INDEX_ROTATION_CONFIG_MISSING);
      // Default to z axis with nominal_index 0 for backwards compatibility, but flag it
      const axis = "z";
      const targetIndex = 0;
      const action: Action = {
        action_id: `A${actionCounter.value++}`,
        type: "rotate_to_index",
        description: `Rotate ${partName} to target detent index ${targetIndex} about +${axis.toUpperCase()} (nominal index). WARNING: index_rotation config missing.`,
        axis,
        target_index: targetIndex,
        delta: makeDelta(zeros(), errors.qErr),
        clamp_applied: false
      };
      reasons.push(ReasonCode.INDEX_ROTATION);
      return { action, reasons, clamped: false, blocked: false, residualRotationDeg: 0 };
    }

    const axis = constraint.index_rotation.axis;
    const targetIndex = constraint.index_rotation.nominal_index;
    const action: Action = {
      action_id: `A${actionCounter.value++}`,
      type: "rotate_to_index",
      description: `Rotate ${partName} to target detent index ${targetIndex} about +${axis.toUpperCase()} (nominal index).`,
      axis,
      target_index: targetIndex,
      delta: makeDelta(zeros(), errors.qErr),
      clamp_applied: false
    };
    reasons.push(ReasonCode.INDEX_ROTATION);
    return { action, reasons, clamped: false, blocked: false, residualRotationDeg: 0 };
  }

  if (constraint.rotation_mode === "free") {
    const axis = dominantAxis(constraint.allowed_rotation_axes, errors.rAxis) ??
      pickRotationAxis(constraint.allowed_rotation_axes) ?? "x";

    let rotationQuat = errors.qErr;
    let rotationClampApplied = false;
    let originalRotationDelta: TransformDelta | undefined;
    let residualRotationDeg = 0;

    if (constraint.rotation_max_abs_deg) {
      const maxDeg = constraint.rotation_max_abs_deg[axis];
      if (typeof maxDeg === "number" && maxDeg > 0) {
        const clampResult = clampQuatAngle(errors.qErr, maxDeg);
        if (clampResult.changed) {
          rotationClampApplied = true;
          originalRotationDelta = makeDelta(zeros(), errors.qErr);
          rotationQuat = clampResult.clamped;
          residualRotationDeg = clampResult.originalDeg - maxDeg;
          reasons.push(ReasonCode.ROTATION_CLAMPED);
        }
      }
    }

    // Check for single-axis rotation
    const axisCount = (constraint.allowed_rotation_axes.x ? 1 : 0) +
      (constraint.allowed_rotation_axes.y ? 1 : 0) +
      (constraint.allowed_rotation_axes.z ? 1 : 0);
    if (axisCount === 1) {
      reasons.push(ReasonCode.ROTATION_FREE_SINGLE_AXIS);
    }

    if (!rotationClampApplied) {
      residualRotationDeg = 0;
    }

    const desc = rotationClampApplied
      ? `Rotate ${partName} about +${axis.toUpperCase()} toward nominal but clamp to max abs limit.`
      : `Rotate ${partName} about +${axis.toUpperCase()} back to nominal.`;

    const action: Action = {
      action_id: `A${actionCounter.value++}`,
      type: "rotate",
      description: desc,
      axis,
      delta: makeDelta(zeros(), rotationQuat),
      clamp_applied: rotationClampApplied,
      original_delta: originalRotationDelta
    };

    return { action, reasons, clamped: rotationClampApplied, blocked: false, residualRotationDeg };
  }

  // rotation_mode === "fixed" but out of tolerance: blocked
  reasons.push(ReasonCode.ROTATION_LOCKED_BLOCKED);
  return { action: null, reasons, clamped: false, blocked: true, residualRotationDeg: errors.rErrDeg };
}

// ============================================================================
// Main Entry Point
// ============================================================================

export interface GenerateDirectivesOptions {
  inputPaths?: { nominal: string; asBuilt: string; constraints: string };
  engineVersion?: string;
  generatedAt?: string;
}

export interface GenerateDirectivesInput {
  nominal: NominalPosesDataset;
  asBuilt: AsBuiltPosesDataset;
  constraints: ConstraintsDataset;
  options?: GenerateDirectivesOptions;
}

/**
 * Generate directives from nominal poses, as-built poses, and constraints.
 *
 * This function analyzes the deviation between nominal and as-built poses,
 * then generates actionable directives for each part that needs adjustment.
 *
 * @param input - The input datasets and options
 * @returns DirectivesOutput with steps for each part
 *
 * @example
 * ```ts
 * const output = generateDirectives({
 *   nominal: nominalPosesDataset,
 *   asBuilt: asBuiltPosesDataset,
 *   constraints: constraintsDataset
 * });
 * console.log(output.summary.counts_by_status);
 * ```
 */
export function generateDirectives({
  nominal,
  asBuilt,
  constraints,
  options = {}
}: GenerateDirectivesInput): DirectivesOutput {
  const inputPaths = options.inputPaths ?? { nominal: "unknown", asBuilt: "unknown", constraints: "unknown" };
  const engineVersion = options.engineVersion ?? "directive-engine/0.1.0";
  const confidenceThreshold = constraints.engine_config.confidence_threshold;

  const asBuiltById = new Map<string, AsBuiltPartPose>(
    asBuilt.parts.map(p => [p.part_id, p])
  );
  const constraintById = new Map<string, PartConstraint>(
    constraints.parts.map(p => [p.part_id, p])
  );

  const steps: Step[] = [];
  const actionCounter = { value: 1 };
  const verificationCounter = { value: 1 };

  for (let i = 0; i < nominal.parts.length; i++) {
    const n = nominal.parts[i];
    const a = asBuiltById.get(n.part_id);
    const c = constraintById.get(n.part_id);
    const stepId = `S${i + 1}`;

    // Handle missing data
    if (!a || !c) {
      steps.push(createMissingDataStep(
        stepId, n.part_id, a?.pose_confidence, actionCounter, verificationCounter
      ));
      continue;
    }

    const errors = computeErrors(n.T_world_part_nominal, a.T_world_part_asBuilt);

    // Check confidence gate
    if (a.pose_confidence < confidenceThreshold) {
      steps.push(createLowConfidenceStep(
        stepId, n.part_id, a.pose_confidence, errors, c, actionCounter, verificationCounter
      ));
      continue;
    }

    // Check within tolerance
    if (withinTol(errors.tErrNorm, errors.rErrDeg, c.tolerances)) {
      steps.push(createWithinToleranceStep(
        stepId, n.part_id, a.pose_confidence, errors, c, actionCounter, verificationCounter
      ));
      continue;
    }

    // Check blocked conditions (translation exceeds max norm)
    if (typeof c.translation_max_norm_mm === "number") {
      if (errors.tErrNorm > c.translation_max_norm_mm + EPS) {
        steps.push(createBlockedStep(
          stepId, n.part_id, a.pose_confidence, errors, c, verificationCounter
        ));
        continue;
      }
    }

    // Generate actions
    const ctx: ActionGenerationContext = {
      partName: n.part_name,
      constraint: c,
      errors,
      actionCounter
    };

    const actions: Action[] = [];
    const reasonCodes: ReasonCodeType[] = [];
    let status: Status = "pending";
    let appliedTranslation = zeros();
    let residualRotationDeg = errors.rErrDeg;

    // Generate translation action
    const transResult = generateTranslationAction(ctx, constraints.engine_config.translation_clamp_policy);
    if (transResult.action) {
      actions.push(transResult.action);
      appliedTranslation = transResult.appliedTranslation;
    }
    reasonCodes.push(...transResult.reasons);
    if (transResult.clamped) {
      status = "clamped";
    }

    // Generate rotation action
    const rotResult = generateRotationAction(ctx);
    if (rotResult.action) {
      actions.push(rotResult.action);
    }
    reasonCodes.push(...rotResult.reasons);
    if (rotResult.clamped && status !== "blocked") {
      status = "clamped";
    }
    if (rotResult.blocked) {
      status = "blocked";
      actions.length = 0; // Clear actions for blocked status
    }
    residualRotationDeg = rotResult.residualRotationDeg;

    // Finalize status
    if (status !== "clamped" && status !== "blocked") {
      status = "pending";
    }

    const residualT = computeExpectedResidual(errors.tErr, appliedTranslation);

    steps.push({
      step_id: stepId,
      part_id: n.part_id,
      status,
      reason_codes: reasonCodes,
      pose_confidence: a.pose_confidence,
      computed_errors: {
        translation_error_mm_vec: errors.tErr,
        translation_error_norm_mm: errors.tErrNorm,
        rotation_error_deg: errors.rErrDeg
      },
      actions,
      verification: [{
        verification_id: `V${verificationCounter.value++}`,
        type: verificationTypeForConstraint(c),
        acceptance: {
          translation_mm: c.tolerances.translation_mm,
          rotation_deg: c.tolerances.rotation_deg
        },
        expected_residual: { translation_mm_vec: residualT, rotation_deg: residualRotationDeg },
        expected_result: expectedResultForStatus(status),
        notes: c.verification?.notes
      }]
    });
  }

  // Compute summary counts
  const counts: Record<Status, number> = {
    ok: 0, pending: 0, clamped: 0, blocked: 0, needs_review: 0
  };
  for (const s of steps) {
    counts[s.status]++;
  }

  return {
    schema_version: "v0.1",
    dataset_id: nominal.dataset_id,
    engine_version: engineVersion,
    generated_at: options.generatedAt ?? addSecondsIso(asBuilt.measured_at, 1),
    inputs: {
      nominal_poses: inputPaths.nominal,
      as_built_poses: inputPaths.asBuilt,
      constraints: inputPaths.constraints,
      confidence_threshold: confidenceThreshold
    },
    summary: { counts_by_status: counts },
    steps
  };
}
