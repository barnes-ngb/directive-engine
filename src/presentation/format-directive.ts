/**
 * Presentation layer: render engine-emitted directives in installer language.
 *
 * The engine produces machine-flavoured actions (e.g. "translate +3.2mm Y").
 * `formatDirective` re-renders those against a part's named kinematic features
 * (joints, slots, indexed bolt patterns) so the output reads like an installer
 * instruction: "Pivot 0.4° about J1. Translate +3.2mm along S2."
 *
 * Pure function: no DOM, no I/O, no console output. Engine output is unchanged
 * regardless of whether features are declared.
 */
import type {
  Action,
  Feature,
  IndexFeature,
  JointFeature,
  PartConstraint,
  Quat,
  SlotFeature,
  Step,
  Vec3,
} from "../core/types.js";
import { toAxisAngle } from "../core/math/quat.js";

const EPS = 1e-6;
const AXIS_ALIGNMENT_THRESHOLD = 0.95;

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function vecNorm(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const n = vecNorm(v);
  if (n < EPS) return [0, 0, 0];
  return [v[0] / n, v[1] / n, v[2] / n];
}

function round1(n: number): number {
  // Avoid -0.0 in user-facing strings.
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

function formatSignedMm(n: number): string {
  const r = round1(n);
  if (r === 0) return "0.0mm";
  return r > 0 ? `+${r.toFixed(1)}mm` : `${r.toFixed(1)}mm`;
}

function formatSignedDeg(n: number): string {
  const r = round1(n);
  if (r === 0) return "0.0°";
  return r > 0 ? `+${r.toFixed(1)}°` : `${r.toFixed(1)}°`;
}

function formatDescription(desc: string | undefined): string {
  if (!desc) return "";
  const trimmed = desc.trim().replace(/[.!?;,]+$/, "");
  if (trimmed.length === 0) return "";
  return ` (${trimmed})`;
}

function dominantAxisOf(v: Vec3): { axis: "X" | "Y" | "Z"; signedMagnitude: number } {
  const ax = Math.abs(v[0]);
  const ay = Math.abs(v[1]);
  const az = Math.abs(v[2]);
  if (ax >= ay && ax >= az) return { axis: "X", signedMagnitude: v[0] };
  if (ay >= az) return { axis: "Y", signedMagnitude: v[1] };
  return { axis: "Z", signedMagnitude: v[2] };
}

/**
 * Return the signed rotation angle (deg) of `q` projected along the named axis.
 * Sign reflects the direction component of the rotation axis along the named axis.
 */
function signedAngleAlong(q: Quat, axisName: "x" | "y" | "z"): number {
  const { axis, angleDeg } = toAxisAngle(q);
  const idx = axisName === "x" ? 0 : axisName === "y" ? 1 : 2;
  const sign = axis[idx] >= 0 ? 1 : -1;
  return sign * angleDeg;
}

// ---------------------------------------------------------------------------
// Feature lookup
// ---------------------------------------------------------------------------

function findBestSlot(
  translation: Vec3,
  features: Feature[] | undefined
): { slot: SlotFeature; signedMagnitude: number } | null {
  if (!features) return null;
  const tNorm = vecNorm(translation);
  if (tNorm < EPS) return null;
  const tHat = normalize(translation);
  let best: { slot: SlotFeature; alignment: number; signedMagnitude: number } | null = null;
  for (const f of features) {
    if (f.kind !== "slot") continue;
    const aHat = normalize(f.axis);
    if (vecNorm(aHat) < EPS) continue;
    const alignment = Math.abs(dot(tHat, aHat));
    if (alignment >= AXIS_ALIGNMENT_THRESHOLD && (!best || alignment > best.alignment)) {
      // Signed magnitude along slot's declared positive direction.
      const signedMagnitude = dot(translation, aHat);
      best = { slot: f, alignment, signedMagnitude };
    }
  }
  return best ? { slot: best.slot, signedMagnitude: best.signedMagnitude } : null;
}

function axisVecOf(name: "x" | "y" | "z"): Vec3 {
  if (name === "x") return [1, 0, 0];
  if (name === "y") return [0, 1, 0];
  return [0, 0, 1];
}

function findFeatureAlignedWithAxis<K extends Feature["kind"]>(
  kind: K,
  axisName: "x" | "y" | "z",
  features: Feature[] | undefined
): Extract<Feature, { kind: K }> | null {
  if (!features) return null;
  const target = axisVecOf(axisName);
  for (const f of features) {
    if (f.kind !== kind) continue;
    const aHat = normalize(f.axis);
    if (vecNorm(aHat) < EPS) continue;
    if (Math.abs(dot(aHat, target)) >= AXIS_ALIGNMENT_THRESHOLD) {
      return f as Extract<Feature, { kind: K }>;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-action formatters
// ---------------------------------------------------------------------------

function formatTranslate(action: Action, features: Feature[] | undefined): string {
  const t = action.delta?.translation_mm ?? [0, 0, 0];
  if (vecNorm(t) < EPS) return "Hold position (no translation)";

  const match = findBestSlot(t, features);
  if (match) {
    const desc = formatDescription(match.slot.description);
    return `Translate ${formatSignedMm(match.signedMagnitude)} along slot ${match.slot.id}${desc}`;
  }

  const dom = dominantAxisOf(t);
  return `Translate ${formatSignedMm(dom.signedMagnitude)} along part-frame ${dom.axis}`;
}

function formatRotate(action: Action, features: Feature[] | undefined): string {
  if (!action.axis || !action.delta) return "Rotate";
  const signedDeg = signedAngleAlong(action.delta.rotation_quat_xyzw, action.axis);
  if (Math.abs(signedDeg) < 0.05) return "Hold rotation (within tolerance)";

  const joint = findFeatureAlignedWithAxis<"joint">("joint", action.axis, features) as JointFeature | null;
  if (joint) {
    const desc = formatDescription(joint.description);
    return `Pivot ${formatSignedDeg(signedDeg)} about ${joint.id}${desc}`;
  }
  return `Rotate ${formatSignedDeg(signedDeg)} about part-frame +${action.axis.toUpperCase()}`;
}

function formatRotateToIndex(action: Action, features: Feature[] | undefined): string {
  const targetIndex = action.target_index;
  if (action.axis) {
    const idxFeature = findFeatureAlignedWithAxis<"index">("index", action.axis, features) as IndexFeature | null;
    if (idxFeature && targetIndex !== undefined) {
      const desc = formatDescription(idxFeature.description);
      return `Rotate to index ${targetIndex} on ${idxFeature.id}${desc}`;
    }
    if (targetIndex !== undefined) {
      return `Rotate to detent index ${targetIndex} about part-frame +${action.axis.toUpperCase()}`;
    }
  }
  return "Rotate to nominal index";
}

function formatNoop(step: Step): string {
  const reasons = step.reason_codes;
  if (reasons.includes("within_tolerance")) return "No adjustment required (within tolerance)";
  if (reasons.includes("low_confidence")) {
    return "Hold; pose confidence below threshold — request re-scan";
  }
  if (reasons.includes("missing_input_data")) {
    return "Cannot issue directive: missing input data";
  }
  return "No action";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Render a `Step` from `generateDirectives` output as a human-readable
 * installer directive. When `constraint.features` is declared, action axes
 * are matched to named features and rendered as joint/slot/index references.
 * When features are absent, a generic part-frame fallback is used.
 *
 * Output is one logical line composed of `". "`-joined clauses ending in `.`,
 * suitable for placement into a directive card.
 *
 * @example
 * // With features:
 * //   "Pivot +0.4° about J1 (CCW from outside face). Translate +3.2mm along S2.
 * //    Status: pending. Tolerance: ±2.0mm."
 * @example
 * // Without features:
 * //   "Translate +3.2mm along part-frame Y. Status: pending. Tolerance: ±2.0mm."
 */
export function formatDirective(step: Step, constraint?: PartConstraint): string {
  const features = constraint?.features;
  const clauses: string[] = [];

  if (step.status === "blocked") {
    clauses.push("Blocked: deviation exceeds limits — escalate");
    if (constraint?.translation_max_norm_mm !== undefined) {
      clauses.push(`Limit: ${constraint.translation_max_norm_mm.toFixed(1)}mm max`);
    }
    clauses.push("Status: blocked");
    return clauses.join(". ") + ".";
  }

  const motionActions = step.actions.filter((a) => a.type !== "noop");
  if (motionActions.length === 0) {
    clauses.push(formatNoop(step));
  } else {
    for (const action of motionActions) {
      if (action.type === "translate") {
        clauses.push(formatTranslate(action, features));
      } else if (action.type === "rotate") {
        clauses.push(formatRotate(action, features));
      } else if (action.type === "rotate_to_index") {
        clauses.push(formatRotateToIndex(action, features));
      }
    }
  }

  clauses.push(`Status: ${step.status}`);

  if (step.status === "clamped") {
    const clampedAction = step.actions.find((a) => a.clamp_applied);
    const clampedT = clampedAction?.delta?.translation_mm;
    if (clampedT) {
      const mag = vecNorm(clampedT);
      clauses.push(`Tolerance: clamped at ${round1(mag).toFixed(1)}mm bound`);
    } else if (constraint) {
      clauses.push(`Tolerance: clamped to limits`);
    }
  } else if (constraint) {
    clauses.push(`Tolerance: ±${constraint.tolerances.translation_mm.toFixed(1)}mm`);
  }

  return clauses.join(". ") + ".";
}
