/**
 * Bridges the viewer fixture format to the `generateDirectives()` engine.
 *
 * The viewer's `FacadeFixture` uses a compact `{ t, q }` pose shape and a
 * loose constraints JSON. The engine expects strict v0.1 schemas
 * (`NominalPosesDataset`, `AsBuiltPosesDataset`, `ConstraintsDataset`).
 *
 * This module maps between the two and memoizes the result so the engine
 * runs once per fixture, not once per beat transition.
 */

import { generateDirectives } from "../core/index.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  Feature,
  NominalPosesDataset,
  PartConstraint,
  Step,
} from "../core/types.js";
import type { FacadeFixture, FacadePart } from "./load-fixture.js";

const ENGINE_AS_BUILT_MEASURED_AT = "2025-01-01T00:00:00.000Z";

interface RawConstraints {
  defaults?: {
    toleranceMm?: number;
    confidenceThreshold?: number;
  };
  parts?: Record<string, RawPartConstraint>;
}

interface RawPartConstraint {
  allowedTranslations?: {
    axes?: Array<"x" | "y" | "z">;
    maxMm?: number;
  };
  allowedRotation?:
    | { type: "none" }
    | { type: "free"; axes?: Array<"x" | "y" | "z">; maxDeg?: number }
    | {
        type: "index";
        axis: "x" | "y" | "z";
        stepDegrees: number;
        allowedIndices: number[];
      };
  tolerances?: {
    translationMm?: number;
    rotationDeg?: number;
  };
  features?: Feature[];
}

export interface EngineBundle {
  output: DirectivesOutput;
  nominal: NominalPosesDataset;
  asBuilt: AsBuiltPosesDataset;
  constraints: ConstraintsDataset;
  /** Constraint lookup by part_id (convenience for the overlay/scene). */
  constraintById: Map<string, PartConstraint>;
  /** Step lookup by part_id (convenience for the overlay/scene). */
  stepByPartId: Map<string, Step>;
  /** Max translation deviation across parts, before correction (mm). */
  beforeMaxDeviationMm: number;
  /** Max expected residual translation after the directive is applied (mm). */
  afterMaxDeviationMm: number;
}

const memo = new WeakMap<FacadeFixture, EngineBundle>();

/**
 * Run `generateDirectives` on a fixture (memoized) and return everything the
 * viewer needs: the raw output plus convenience lookups and metrics.
 */
export function buildEngineBundle(fixture: FacadeFixture): EngineBundle {
  const cached = memo.get(fixture);
  if (cached) return cached;

  const nominal = toNominalDataset(fixture);
  const asBuilt = toAsBuiltDataset(fixture);
  const constraints = toConstraintsDataset(fixture);

  const output = generateDirectives({ nominal, asBuilt, constraints });

  const constraintById = new Map(constraints.parts.map((p) => [p.part_id, p]));
  const stepByPartId = new Map(output.steps.map((s) => [s.part_id, s]));

  let beforeMax = 0;
  let afterMax = 0;
  for (const step of output.steps) {
    beforeMax = Math.max(beforeMax, step.computed_errors.translation_error_norm_mm);
    const residualVec = step.verification[0]?.expected_residual.translation_mm_vec ?? [0, 0, 0];
    const residualNorm = Math.hypot(residualVec[0], residualVec[1], residualVec[2]);
    afterMax = Math.max(afterMax, residualNorm);
  }

  const bundle: EngineBundle = {
    output,
    nominal,
    asBuilt,
    constraints,
    constraintById,
    stepByPartId,
    beforeMaxDeviationMm: beforeMax,
    afterMaxDeviationMm: afterMax,
  };
  memo.set(fixture, bundle);
  return bundle;
}

/**
 * Pick the part with the largest translation deviation that is not already
 * within tolerance. Falls back to the first part if all are within tol.
 */
export function pickFocusedPart(bundle: EngineBundle): string | null {
  let best: { partId: string; magnitude: number } | null = null;
  for (const step of bundle.output.steps) {
    if (step.status === "ok") continue;
    const mag = step.computed_errors.translation_error_norm_mm;
    if (!best || mag > best.magnitude) {
      best = { partId: step.part_id, magnitude: mag };
    }
  }
  if (best) return best.partId;
  return bundle.output.steps[0]?.part_id ?? null;
}

// ---------------------------------------------------------------------------
// Mapping helpers — viewer fixture → engine schema
// ---------------------------------------------------------------------------

function toNominalDataset(fixture: FacadeFixture): NominalPosesDataset {
  return {
    schema_version: "v0.1",
    dataset_id: fixture.jobId,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: fixture.parts.map((p) => ({
      part_id: p.partId,
      part_name: p.partId,
      part_type: "panel",
      T_world_part_nominal: {
        translation_mm: [...p.nominal.t],
        rotation_quat_xyzw: [...p.nominal.q],
      },
    })),
  };
}

function toAsBuiltDataset(fixture: FacadeFixture): AsBuiltPosesDataset {
  const parts = fixture.parts.filter(hasAsBuilt).map((p) => ({
    part_id: p.partId,
    T_world_part_asBuilt: {
      translation_mm: [...p.asBuilt!.t] as [number, number, number],
      rotation_quat_xyzw: [...p.asBuilt!.q] as [number, number, number, number],
    },
    pose_confidence: p.asBuiltConfidence ?? 1.0,
  }));
  return {
    schema_version: "v0.1",
    dataset_id: fixture.jobId,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: ENGINE_AS_BUILT_MEASURED_AT,
    parts,
  };
}

function hasAsBuilt(p: FacadePart): boolean {
  return p.asBuilt !== undefined;
}

function toConstraintsDataset(fixture: FacadeFixture): ConstraintsDataset {
  const raw = (fixture.constraintsRaw ?? {}) as RawConstraints;
  const defaultsTol = raw.defaults?.toleranceMm ?? 2.0;
  const confThreshold = raw.defaults?.confidenceThreshold ?? 0.85;

  const partConstraints: PartConstraint[] = fixture.parts.map((p) => {
    const rp = raw.parts?.[p.partId];
    return mapPartConstraint(p.partId, rp, defaultsTol);
  });

  return {
    schema_version: "v0.1",
    dataset_id: fixture.jobId,
    engine_config: {
      confidence_threshold: confThreshold,
      translation_clamp_policy: "per_axis_max_abs",
    },
    parts: partConstraints,
  };
}

function mapPartConstraint(
  partId: string,
  raw: RawPartConstraint | undefined,
  defaultTolMm: number,
): PartConstraint {
  const allowedAxes = new Set(raw?.allowedTranslations?.axes ?? ["x", "y", "z"]);
  const maxMm = raw?.allowedTranslations?.maxMm;
  const rotation = raw?.allowedRotation ?? { type: "none" as const };
  const tolT = raw?.tolerances?.translationMm ?? defaultTolMm;
  const tolR = raw?.tolerances?.rotationDeg ?? 1.0;

  const base: PartConstraint = {
    part_id: partId,
    allowed_translation_axes: {
      x: allowedAxes.has("x"),
      y: allowedAxes.has("y"),
      z: allowedAxes.has("z"),
    },
    rotation_mode: "fixed",
    allowed_rotation_axes: { x: false, y: false, z: false },
    tolerances: { translation_mm: tolT, rotation_deg: tolR },
    features: raw?.features,
  };
  if (typeof maxMm === "number") {
    base.translation_max_norm_mm = maxMm;
    base.translation_max_abs_mm = { x: maxMm, y: maxMm, z: maxMm };
  }

  if (rotation.type === "none") {
    return base;
  }
  if (rotation.type === "free") {
    const axes = new Set(rotation.axes ?? ["x", "y", "z"]);
    base.rotation_mode = "free";
    base.allowed_rotation_axes = {
      x: axes.has("x"),
      y: axes.has("y"),
      z: axes.has("z"),
    };
    const maxDeg = rotation.maxDeg;
    if (typeof maxDeg === "number") {
      base.rotation_max_abs_deg = { x: maxDeg, y: maxDeg, z: maxDeg };
    }
    return base;
  }
  // index
  base.rotation_mode = "index";
  base.allowed_rotation_axes = {
    x: rotation.axis === "x",
    y: rotation.axis === "y",
    z: rotation.axis === "z",
  };
  base.index_rotation = {
    axis: rotation.axis,
    increment_deg: rotation.stepDegrees,
    allowed_indices: rotation.allowedIndices,
    nominal_index: rotation.allowedIndices[0] ?? 0,
  };
  return base;
}
