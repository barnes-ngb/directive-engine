import type {
  Action,
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  PartConstraint,
  Status,
  Step,
  TransformDelta,
  Vec3,
  Verification
} from "./types.js";

import { sub, norm, clampVecPerAxis } from "./math/vec.js";
import { inverse as qInv, multiply as qMul, angleDeg as qAngleDeg, identity as qIdent, normalize as qNorm } from "./math/quat.js";

const EPS = 1e-9;

function zeros(): Vec3 {
  return [0,0,0];
}

function maskTranslation(v: Vec3, mask: {x:boolean;y:boolean;z:boolean}): Vec3 {
  return [
    mask.x ? v[0] : 0,
    mask.y ? v[1] : 0,
    mask.z ? v[2] : 0
  ];
}

function pickRotationAxis(mask: {x:boolean;y:boolean;z:boolean}): "x"|"y"|"z"|undefined {
  if (mask.x) return "x";
  if (mask.y) return "y";
  if (mask.z) return "z";
  return undefined;
}

function addSecondsIso(iso: string, seconds: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`Invalid ISO timestamp: "${iso}"`);
  }
  return new Date(t + seconds*1000).toISOString();
}

function computeErrors(nominalT: {translation_mm: Vec3; rotation_quat_xyzw: [number,number,number,number]},
                       asBuiltT: {translation_mm: Vec3; rotation_quat_xyzw: [number,number,number,number]}) {
  const tErr = sub(nominalT.translation_mm, asBuiltT.translation_mm);
  const tErrNorm = norm(tErr);
  const qErr = qNorm(qMul(nominalT.rotation_quat_xyzw, qInv(asBuiltT.rotation_quat_xyzw)));
  const rErrDeg = qAngleDeg(qErr);
  return { tErr, tErrNorm, qErr, rErrDeg };
}

function withinTol(tNorm: number, rDeg: number, tol: {translation_mm:number; rotation_deg:number}): boolean {
  return tNorm <= tol.translation_mm + 1e-12 && rDeg <= tol.rotation_deg + 1e-12;
}

function makeDelta(translation_mm: Vec3, rotation_quat_xyzw: [number,number,number,number]): TransformDelta {
  return { translation_mm, rotation_quat_xyzw };
}

function computeExpectedResidual(originalTErr: Vec3, appliedTranslation: Vec3): Vec3 {
  return [originalTErr[0] - appliedTranslation[0], originalTErr[1] - appliedTranslation[1], originalTErr[2] - appliedTranslation[2]];
}

function verificationTypeForConstraint(c: PartConstraint): Verification["type"] {
  return c.verification?.method ?? "measure_pose";
}

function expectedResultForStatus(status: Status): Verification["expected_result"] {
  if (status === "blocked") return "expected_fail";
  if (status === "needs_review") return "unknown";
  return "expected_pass";
}

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

export function generateDirectives({
  nominal,
  asBuilt,
  constraints,
  options = {}
}: GenerateDirectivesInput): DirectivesOutput {
  const inputPaths = options.inputPaths ?? { nominal: "unknown", asBuilt: "unknown", constraints: "unknown" };
  const engineVersion = options.engineVersion ?? "directive-engine/0.1.0";

  const confidenceThreshold = constraints.engine_config.confidence_threshold;

  const asBuiltById = new Map(asBuilt.parts.map(p => [p.part_id, p]));
  const constraintById = new Map(constraints.parts.map(p => [p.part_id, p]));

  const steps: Step[] = [];
  let actionCounter = 1;
  let verificationCounter = 1;

  for (let i = 0; i < nominal.parts.length; i++) {
    const n = nominal.parts[i];
    const a = asBuiltById.get(n.part_id);
    const c = constraintById.get(n.part_id);

    const stepId = `S${i+1}`;

    if (!a || !c) {
      // Missing data: treat as needs_review for MVP.
      const computed_errors = {
        translation_error_mm_vec: [0,0,0] as Vec3,
        translation_error_norm_mm: 0,
        rotation_error_deg: 0
      };
      const status: Status = "needs_review";
      steps.push({
        step_id: stepId,
        part_id: n.part_id,
        status,
        reason_codes: ["missing_input_data"],
        pose_confidence: a?.pose_confidence,
        computed_errors,
        actions: [{
          action_id: `A${actionCounter++}`,
          type: "noop",
          description: "Missing nominal/as-built/constraints input. Cannot issue directive."
        }],
        verification: [{
          verification_id: `V${verificationCounter++}`,
          type: "re_scan",
          acceptance: { translation_mm: 0, rotation_deg: 0 },
          expected_residual: { translation_mm_vec: [0,0,0], rotation_deg: 0 },
          expected_result: "unknown",
          notes: "Resolve missing inputs."
        }]
      });
      continue;
    }

    const { tErr, tErrNorm, qErr, rErrDeg } = computeErrors(n.T_world_part_nominal, a.T_world_part_asBuilt);

    const computed_errors = {
      translation_error_mm_vec: tErr,
      translation_error_norm_mm: tErrNorm,
      rotation_error_deg: rErrDeg
    };

    // Default step skeleton
    let status: Status = "pending";
    const reason_codes: string[] = [];
    const actions: Action[] = [];

    // Confidence gate
    if (a.pose_confidence < confidenceThreshold) {
      status = "needs_review";
      reason_codes.push("low_confidence");
      actions.push({
        action_id: `A${actionCounter++}`,
        type: "noop",
        description: "Do not move part: pose confidence below threshold. Request re-scan.",
        delta: makeDelta(zeros(), qIdent())
      });

      const vType = verificationTypeForConstraint(c);
      const verification: Verification[] = [{
        verification_id: `V${verificationCounter++}`,
        type: vType === "measure_pose" ? "re_scan" : vType, // nudge toward re_scan in needs_review
        acceptance: { translation_mm: c.tolerances.translation_mm, rotation_deg: c.tolerances.rotation_deg },
        expected_residual: { translation_mm_vec: tErr, rotation_deg: rErrDeg },
        expected_result: expectedResultForStatus(status),
        notes: c.verification?.notes ?? "Re-scan to improve confidence before issuing motion directives."
      }];

      steps.push({
        step_id: stepId,
        part_id: n.part_id,
        status,
        reason_codes,
        pose_confidence: a.pose_confidence,
        computed_errors,
        actions,
        verification
      });
      continue;
    }

    // Within tolerance?
    if (withinTol(tErrNorm, rErrDeg, c.tolerances)) {
      status = "ok";
      reason_codes.push("within_tolerance");
      actions.push({
        action_id: `A${actionCounter++}`,
        type: "noop",
        description: "No adjustment required; as-built pose is within tolerance.",
        delta: makeDelta(zeros(), qIdent())
      });

      const verification: Verification[] = [{
        verification_id: `V${verificationCounter++}`,
        type: verificationTypeForConstraint(c),
        acceptance: { translation_mm: c.tolerances.translation_mm, rotation_deg: c.tolerances.rotation_deg },
        expected_residual: { translation_mm_vec: zeros(), rotation_deg: 0 },
        expected_result: expectedResultForStatus(status),
        notes: c.verification?.notes
      }];

      steps.push({
        step_id: stepId,
        part_id: n.part_id,
        status,
        reason_codes,
        pose_confidence: a.pose_confidence,
        computed_errors,
        actions,
        verification
      });
      continue;
    }

    // Block conditions (MVP)
    if (typeof c.translation_max_norm_mm === "number") {
      if (tErrNorm > c.translation_max_norm_mm + EPS) {
        status = "blocked";
        reason_codes.push("outside_limits_blocked", "translation_exceeds_max_norm");

        const verification: Verification[] = [{
          verification_id: `V${verificationCounter++}`,
          type: verificationTypeForConstraint(c),
          acceptance: { translation_mm: c.tolerances.translation_mm, rotation_deg: c.tolerances.rotation_deg },
          expected_residual: { translation_mm_vec: tErr, rotation_deg: rErrDeg },
          expected_result: expectedResultForStatus(status),
          notes: c.verification?.notes ?? `Required translation exceeds translation_max_norm_mm=${c.translation_max_norm_mm}; do not attempt correction; escalate.`
        }];

        steps.push({
          step_id: stepId,
          part_id: n.part_id,
          status,
          reason_codes,
          pose_confidence: a.pose_confidence,
          computed_errors,
          actions: [],
          verification
        });
        continue;
      }
    }

    // Otherwise: produce actions (translate and/or rotate)
    let appliedTranslation: Vec3 = zeros();
    let residualRotationDeg = rErrDeg;

    // Translation action if translation error out of tolerance
    if (tErrNorm > c.tolerances.translation_mm + EPS) {
      reason_codes.push("translation_out_of_tolerance");

      const masked = maskTranslation(tErr, c.allowed_translation_axes);
      let deltaT = masked;
      let clampApplied = false;
      let originalDelta: TransformDelta | undefined;

      if (c.translation_max_abs_mm && (constraints.engine_config.translation_clamp_policy ?? "per_axis_max_abs") === "per_axis_max_abs") {
        const maxAbs: Vec3 = [c.translation_max_abs_mm.x, c.translation_max_abs_mm.y, c.translation_max_abs_mm.z];
        const res = clampVecPerAxis(masked, maxAbs);
        deltaT = res.clamped;
        clampApplied = res.changed;
        if (clampApplied) {
          originalDelta = makeDelta(masked, qIdent());
        }
      }

      appliedTranslation = deltaT;

      const desc = clampApplied
        ? `Translate ${n.part_name} toward nominal but clamp to per-axis max abs limits.`
        : `Translate ${n.part_name} to nominal (rotation locked). Apply delta in world frame.`;

      actions.push({
        action_id: `A${actionCounter++}`,
        type: "translate",
        description: desc,
        delta: makeDelta(deltaT, qIdent()),
        clamp_applied: clampApplied,
        original_delta: originalDelta
      });

      if (clampApplied) {
        status = "clamped";
        reason_codes.push("clamped_to_limits", "translate_clamped");
      } else {
        // keep pending unless later rotation also clamps (not in v0.1)
        reason_codes.push("translate_only");
      }
    }

    // Rotation action if rotation error out of tolerance
    if (rErrDeg > c.tolerances.rotation_deg + EPS) {
      reason_codes.push("rotation_out_of_tolerance");

      if (c.rotation_mode === "index") {
        const axis = c.index_rotation?.axis ?? "z";
        const targetIndex = c.index_rotation?.nominal_index ?? 0;
        actions.push({
          action_id: `A${actionCounter++}`,
          type: "rotate_to_index",
          description: `Rotate ${n.part_name} to target detent index ${targetIndex} about +${axis.toUpperCase()} (nominal index).`,
          axis,
          target_index: targetIndex,
          delta: makeDelta(zeros(), qErr),
          clamp_applied: false
        });
        reason_codes.push("index_rotation");
        residualRotationDeg = 0;
      } else if (c.rotation_mode === "free") {
        const axis = pickRotationAxis(c.allowed_rotation_axes) ?? "x";
        actions.push({
          action_id: `A${actionCounter++}`,
          type: "rotate",
          description: `Rotate ${n.part_name} about +${axis.toUpperCase()} back to nominal.`,
          axis,
          delta: makeDelta(zeros(), qErr),
          clamp_applied: false
        });

        // For the demo: if only one axis is enabled, call it out.
        const singleAxis = (c.allowed_rotation_axes.x ? 1 : 0) + (c.allowed_rotation_axes.y ? 1 : 0) + (c.allowed_rotation_axes.z ? 1 : 0);
        if (singleAxis === 1) reason_codes.push("rotation_free_single_axis");
        residualRotationDeg = 0;
      } else {
        // fixed but out of tolerance: blocked (not exercised in toy dataset)
        status = "blocked";
        reason_codes.push("rotation_locked_blocked");
        actions.length = 0;
      }
    }

    if (status !== "clamped" && status !== "blocked") {
      status = "pending";
    }

    const residualT = computeExpectedResidual(tErr, appliedTranslation);

    const verification: Verification[] = [{
      verification_id: `V${verificationCounter++}`,
      type: verificationTypeForConstraint(c),
      acceptance: { translation_mm: c.tolerances.translation_mm, rotation_deg: c.tolerances.rotation_deg },
      expected_residual: { translation_mm_vec: residualT, rotation_deg: residualRotationDeg },
      expected_result: expectedResultForStatus(status),
      notes: c.verification?.notes
    }];

    steps.push({
      step_id: stepId,
      part_id: n.part_id,
      status,
      reason_codes,
      pose_confidence: a.pose_confidence,
      computed_errors,
      actions,
      verification
    });
  }

  const counts: Record<Status, number> = {
    ok: 0, pending: 0, clamped: 0, blocked: 0, needs_review: 0
  };
  for (const s of steps) counts[s.status]++;

  const out: DirectivesOutput = {
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

  return out;
}
