/**
 * End-to-end pipeline: Fit Fab Part to Scan → Pose + Confidence → Directives
 *
 * This pipeline:
 * 1. Loads museum raw dataset (anchors + part lines)
 * 2. Computes rigid transform (T_model_scan) from anchor correspondences
 * 3. Generates synthetic scan points along scan lines (for MVP)
 * 4. Transforms scan points to model frame
 * 5. Segments points near nominal lines
 * 6. Fits lines via PCA
 * 7. Extracts as-built poses with confidence
 * 8. Runs directive engine
 * 9. Simulates and verifies PASS/FAIL
 */

import type {
  Vec3,
  Transform,
  NominalPosesDataset,
  AsBuiltPosesDataset,
  ConstraintsDataset,
} from "../core/types.js";
import type { MuseumRawDataset, MuseumPart, AnchorPointPairs } from "../core/museum/raw.js";
import type { ScanPoint, LineFitResult, PoseFromFitResult } from "../core/scan/index.js";
import type { RigidTransformResult } from "../core/align/rigid.js";
import type { Step } from "../core/types.js";

import { anchorsToPointPairs } from "../core/museum/raw.js";
import { computeRigidTransform } from "../core/align/rigid.js";
import { applyTransformToPoint, applyTransformToLine } from "../core/align/apply.js";
import {
  segmentPointsNearLine,
  fitLinePCA,
  poseFromLineFit,
  generateSyntheticLinePoints,
} from "../core/scan/index.js";
import { generateDirectives } from "../core/generateDirectives.js";
import { simulateStep } from "../core/simulate.js";
import { sub, add, scale, norm } from "../core/math/vec.js";

// ============================================================================
// Types
// ============================================================================

export interface AnchorAlignmentResult {
  T_model_scan: Transform;
  rms_mm: number;
  rms_initial_mm: number;
  residuals: Array<{
    anchor_id: string;
    residual_mm: number;
    residual_vec: Vec3;
  }>;
  converged: boolean;
  withinTolerance: boolean;
}

export interface PartFitResult {
  part_id: string;
  segmentation: {
    inlier_count: number;
    inlier_ratio: number;
    total_points: number;
  };
  lineFit: LineFitResult;
  pose: PoseFromFitResult;
}

export interface PipelineResult {
  dataset_id: string;
  anchor_alignment: AnchorAlignmentResult;
  part_fits: PartFitResult[];
  nominal_poses: NominalPosesDataset;
  asbuilt_poses: AsBuiltPosesDataset;
  directives: ReturnType<typeof generateDirectives>;
  simulations: Array<{
    part_id: string;
    step: Step;
    before_error_mm: number;
    after_error_mm: number;
    pass: boolean;
    canSimulate: boolean;
  }>;
  summary: {
    anchor_rms_mm: number;
    anchor_within_tolerance: boolean;
    parts_processed: number;
    parts_passed: number;
    parts_failed: number;
  };
}

export interface PipelineConfig {
  /** Target RMS threshold for anchor alignment (mm) */
  anchor_rms_threshold_mm: number;
  /** Tube radius for point segmentation (mm) */
  tube_radius_mm: number;
  /** Number of synthetic points per part */
  synthetic_points_per_part: number;
  /** Noise level for synthetic points (mm) */
  synthetic_noise_mm: number;
  /** Tolerance for verification (mm) */
  verification_tolerance_mm: number;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  anchor_rms_threshold_mm: 5,
  tube_radius_mm: 35,
  synthetic_points_per_part: 100,
  synthetic_noise_mm: 3,
  verification_tolerance_mm: 5,
};

// ============================================================================
// Step 1: Anchor Alignment
// ============================================================================

export function computeAnchorAlignment(
  raw: MuseumRawDataset,
  rmsThreshold: number
): AnchorAlignmentResult {
  const { scanPts, modelPts } = anchorsToPointPairs(raw);

  const result = computeRigidTransform(scanPts, modelPts);

  const residuals = result.residuals_mm.map((r) => ({
    anchor_id: r.anchor_id,
    residual_mm: r.residual_mm,
    residual_vec: r.residual_vec_mm,
  }));

  return {
    T_model_scan: result.T_model_scan,
    rms_mm: result.rms_mm,
    rms_initial_mm: result.rms_initial_mm,
    residuals,
    converged: result.converged ?? true,
    withinTolerance: result.rms_mm <= rmsThreshold,
  };
}

// ============================================================================
// Step 2 & 3: Generate synthetic points and transform to model frame
// ============================================================================

export function generateAndTransformPoints(
  part: MuseumPart,
  T_model_scan: Transform,
  config: PipelineConfig
): { scanPointsModelFrame: ScanPoint[]; transformedNominalLine: { p0: Vec3; p1: Vec3 } } {
  // Generate synthetic scan points along the scan line (in scan frame)
  const scanPoints = generateSyntheticLinePoints(
    part.scan_line_mm.p0,
    part.scan_line_mm.p1,
    {
      num_points: config.synthetic_points_per_part,
      noise_perpendicular_mm: config.synthetic_noise_mm,
      noise_along_mm: config.synthetic_noise_mm * 0.3,
      seed: hashString(part.part_id), // Deterministic for reproducibility
    }
  );

  // Transform scan points to model frame using T_model_scan
  const scanPointsModelFrame: ScanPoint[] = scanPoints.map((pt) => ({
    point_mm: applyTransformToPoint(T_model_scan, pt.point_mm),
  }));

  // Also get the nominal line in model frame (already in model frame, but let's be explicit)
  const transformedNominalLine = {
    p0: part.nominal_line_mm.p0,
    p1: part.nominal_line_mm.p1,
  };

  return { scanPointsModelFrame, transformedNominalLine };
}

// Simple string hash for deterministic seeding
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Step 2: Segment points near nominal line
// ============================================================================

export function segmentPartPoints(
  allPoints: ScanPoint[],
  nominalLine: { p0: Vec3; p1: Vec3 },
  tubeRadius: number
) {
  return segmentPointsNearLine(allPoints, nominalLine.p0, nominalLine.p1, {
    tubeRadius_mm: tubeRadius,
    enforceSegmentBounds: true,
  });
}

// ============================================================================
// Step 4: Pose from nominal line (for nominal dataset)
// ============================================================================

export function nominalPoseFromLine(
  p0: Vec3,
  p1: Vec3
): Transform {
  // Translation: midpoint of the line
  const midpoint: Vec3 = scale(add(p0, p1), 0.5) as Vec3;

  // Rotation: identity for MVP
  return {
    translation_mm: midpoint,
    rotation_quat_xyzw: [0, 0, 0, 1],
  };
}

// ============================================================================
// Full Pipeline
// ============================================================================

export function runPoseFromScanPipeline(
  raw: MuseumRawDataset,
  constraints: ConstraintsDataset,
  config: Partial<PipelineConfig> = {}
): PipelineResult {
  const cfg = { ...DEFAULT_PIPELINE_CONFIG, ...config };

  // Step 1: Anchor alignment
  console.log("\n=== Step 1: Anchor Alignment ===");
  const anchorResult = computeAnchorAlignment(raw, cfg.anchor_rms_threshold_mm);

  console.log(`Anchor RMS: ${anchorResult.rms_mm.toFixed(2)} mm`);
  console.log(`Within tolerance (≤${cfg.anchor_rms_threshold_mm}mm): ${anchorResult.withinTolerance ? "YES ✓" : "NO ✗"}`);
  console.log("\nPer-anchor residuals:");
  for (const r of anchorResult.residuals) {
    const status = r.residual_mm <= cfg.anchor_rms_threshold_mm ? "✓" : "⚠";
    console.log(`  ${r.anchor_id}: ${r.residual_mm.toFixed(2)} mm ${status}`);
  }

  // Step 2-4: Process each part
  console.log("\n=== Steps 2-4: Segment, Fit, Extract Poses ===");
  const parts = raw.parts ?? [];
  const partFits: PartFitResult[] = [];

  for (const part of parts) {
    console.log(`\nProcessing ${part.part_id}...`);

    // Generate synthetic points and transform to model frame
    const { scanPointsModelFrame, transformedNominalLine } = generateAndTransformPoints(
      part,
      anchorResult.T_model_scan,
      cfg
    );

    // Segment points near nominal line
    const segResult = segmentPartPoints(
      scanPointsModelFrame,
      transformedNominalLine,
      cfg.tube_radius_mm
    );

    console.log(`  Points segmented: ${segResult.inlier_count} / ${scanPointsModelFrame.length}`);

    if (segResult.inlier_count < 3) {
      console.log(`  ⚠ Not enough inliers for fitting`);
      continue;
    }

    // Fit line via PCA
    const lineFit = fitLinePCA(segResult.inliers);
    console.log(`  Line fit RMS: ${lineFit.fit_rms_mm.toFixed(2)} mm`);
    console.log(`  Variance explained: ${(lineFit.variance_explained * 100).toFixed(1)}%`);

    // Extract pose with confidence
    const poseResult = poseFromLineFit(lineFit);
    console.log(`  Pose confidence: ${(poseResult.pose_confidence * 100).toFixed(1)}%`);
    console.log(`  ${poseResult.confidence_notes}`);

    partFits.push({
      part_id: part.part_id,
      segmentation: {
        inlier_count: segResult.inlier_count,
        inlier_ratio: segResult.inlier_ratio,
        total_points: scanPointsModelFrame.length,
      },
      lineFit,
      pose: poseResult,
    });
  }

  // Build nominal poses dataset
  const nominal_poses: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id + "_nominal",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: parts.map((part) => ({
      part_id: part.part_id,
      part_name: part.part_id,
      part_type: "mullion",
      T_world_part_nominal: nominalPoseFromLine(part.nominal_line_mm.p0, part.nominal_line_mm.p1),
    })),
  };

  // Build as-built poses dataset
  const asbuilt_poses: AsBuiltPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id + "_asbuilt",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: new Date().toISOString(),
    parts: partFits.map((pf) => ({
      part_id: pf.part_id,
      T_world_part_asBuilt: pf.pose.T_world_part_asBuilt,
      pose_confidence: pf.pose.pose_confidence,
      confidence_notes: pf.pose.confidence_notes,
    })),
  };

  // Step 5: Generate directives
  console.log("\n=== Step 5: Generate Directives ===");
  const directives = generateDirectives({
    nominal: nominal_poses,
    asBuilt: asbuilt_poses,
    constraints,
    options: {
      inputPaths: {
        nominal: "generated",
        asBuilt: "generated",
        constraints: "museum_constraints.json",
      },
      engineVersion: "directive-engine/0.2.0-scan",
    },
  });

  console.log(`\nDirective summary:`);
  console.log(`  ok: ${directives.summary.counts_by_status.ok ?? 0}`);
  console.log(`  pending: ${directives.summary.counts_by_status.pending ?? 0}`);
  console.log(`  clamped: ${directives.summary.counts_by_status.clamped ?? 0}`);
  console.log(`  blocked: ${directives.summary.counts_by_status.blocked ?? 0}`);
  console.log(`  needs_review: ${directives.summary.counts_by_status.needs_review ?? 0}`);

  // Step 5 (cont): Simulate and verify
  console.log("\n=== Simulation & Verification ===");
  const simulations: PipelineResult["simulations"] = [];

  // Retrieve tolerances from constraints
  const constraintMap = new Map(constraints.parts.map((c) => [c.part_id, c]));

  for (const step of directives.steps) {
    const nominalPart = nominal_poses.parts.find((p) => p.part_id === step.part_id);
    const asBuiltPart = asbuilt_poses.parts.find((p) => p.part_id === step.part_id);
    const constraint = constraintMap.get(step.part_id);

    if (!nominalPart || !asBuiltPart || !constraint) {
      console.log(`  ${step.part_id}: Missing data, skipping simulation`);
      continue;
    }

    const simResult = simulateStep({
      nominalPose: nominalPart.T_world_part_nominal,
      asBuiltPose: asBuiltPart.T_world_part_asBuilt,
      step,
      tolerances: constraint.tolerances,
    });

    const passLabel = simResult.pass ? "PASS ✓" : "FAIL ✗";
    const simLabel = simResult.canSimulate ? "" : " (cannot simulate)";

    console.log(`\n  ${step.part_id}:`);
    console.log(`    Status: ${step.status}`);
    console.log(`    Reason codes: ${step.reason_codes.join(", ")}`);
    console.log(`    BEFORE error: ${simResult.beforeError.translation_norm_mm.toFixed(2)} mm`);
    console.log(`    AFTER error:  ${simResult.afterError.translation_norm_mm.toFixed(2)} mm`);
    console.log(`    Tolerance:    ${constraint.tolerances.translation_mm} mm`);
    console.log(`    Result: ${passLabel}${simLabel}`);

    if (step.actions.length > 0 && step.actions[0].type !== "noop") {
      console.log(`    Directive: ${step.actions[0].description}`);
    }

    simulations.push({
      part_id: step.part_id,
      step,
      before_error_mm: simResult.beforeError.translation_norm_mm,
      after_error_mm: simResult.afterError.translation_norm_mm,
      pass: simResult.pass,
      canSimulate: simResult.canSimulate,
    });
  }

  // Summary
  const partsPassed = simulations.filter((s) => s.pass).length;
  const partsFailed = simulations.filter((s) => !s.pass && s.canSimulate).length;

  console.log("\n=== Summary ===");
  console.log(`Anchor alignment RMS: ${anchorResult.rms_mm.toFixed(2)} mm (target ≤ ${cfg.anchor_rms_threshold_mm} mm)`);
  console.log(`Parts processed: ${partFits.length}`);
  console.log(`Simulations PASS: ${partsPassed}`);
  console.log(`Simulations FAIL: ${partsFailed}`);

  return {
    dataset_id: raw.dataset_id,
    anchor_alignment: anchorResult,
    part_fits: partFits,
    nominal_poses,
    asbuilt_poses,
    directives,
    simulations,
    summary: {
      anchor_rms_mm: anchorResult.rms_mm,
      anchor_within_tolerance: anchorResult.withinTolerance,
      parts_processed: partFits.length,
      parts_passed: partsPassed,
      parts_failed: partsFailed,
    },
  };
}
