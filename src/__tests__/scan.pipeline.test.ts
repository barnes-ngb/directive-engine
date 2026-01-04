import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  runPoseFromScanPipeline,
  computeAnchorAlignment,
  DEFAULT_PIPELINE_CONFIG,
} from "../pipelines/poseFromScan.js";
import type { MuseumRawDataset } from "../core/museum/raw.js";
import type { ConstraintsDataset } from "../core/types.js";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("poseFromScan pipeline", () => {
  describe("anchor alignment", () => {
    it("achieves near-zero RMS for perfectly aligned anchors", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );

      const result = computeAnchorAlignment(raw, 5);

      expect(result.rms_mm).toBeLessThan(1);
      expect(result.withinTolerance).toBe(true);
      expect(result.converged).toBe(true);
    });

    it("reports high RMS for misaligned museum data", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/museum_facade_v0_1/directive_engine_export/museum_raw.json"
      );

      const result = computeAnchorAlignment(raw, 5);

      // Museum data has significant misalignment
      expect(result.rms_mm).toBeGreaterThan(10);
      expect(result.withinTolerance).toBe(false);
    });
  });

  describe("full pipeline on test dataset", () => {
    it("processes all parts successfully", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );
      const constraints = await readJson<ConstraintsDataset>(
        "datasets/test_scan_pipeline/test_constraints.json"
      );

      const result = runPoseFromScanPipeline(raw, constraints, {
        ...DEFAULT_PIPELINE_CONFIG,
        tube_radius_mm: 50,
      });

      expect(result.summary.anchor_within_tolerance).toBe(true);
      expect(result.summary.parts_processed).toBe(3);
    });

    it("generates correct statuses for different error levels", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );
      const constraints = await readJson<ConstraintsDataset>(
        "datasets/test_scan_pipeline/test_constraints.json"
      );

      const result = runPoseFromScanPipeline(raw, constraints, {
        ...DEFAULT_PIPELINE_CONFIG,
        tube_radius_mm: 50,
      });

      // Find each part's step
      const steps = result.directives.steps;
      const withinTolStep = steps.find(
        (s) => s.part_id === "MULLION_PASS_WITHIN_TOL"
      );
      const needsCorrStep = steps.find(
        (s) => s.part_id === "MULLION_NEEDS_CORRECTION"
      );
      const largeErrStep = steps.find(
        (s) => s.part_id === "MULLION_LARGE_ERROR"
      );

      expect(withinTolStep?.status).toBe("ok");
      expect(needsCorrStep?.status).toBe("pending");
      expect(largeErrStep?.status).toBe("clamped");
    });

    it("generates correct simulation outcomes", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );
      const constraints = await readJson<ConstraintsDataset>(
        "datasets/test_scan_pipeline/test_constraints.json"
      );

      const result = runPoseFromScanPipeline(raw, constraints, {
        ...DEFAULT_PIPELINE_CONFIG,
        tube_radius_mm: 50,
      });

      // All parts should pass after directives applied
      expect(result.summary.parts_passed).toBe(3);
      expect(result.summary.parts_failed).toBe(0);
    });

    it("records fit quality in part_fits", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );
      const constraints = await readJson<ConstraintsDataset>(
        "datasets/test_scan_pipeline/test_constraints.json"
      );

      const result = runPoseFromScanPipeline(raw, constraints, {
        ...DEFAULT_PIPELINE_CONFIG,
        tube_radius_mm: 50,
        synthetic_noise_mm: 2,
      });

      for (const fit of result.part_fits) {
        expect(fit.lineFit.fit_rms_mm).toBeGreaterThan(0);
        expect(fit.lineFit.variance_explained).toBeGreaterThan(0.9);
        expect(fit.pose.pose_confidence).toBeGreaterThan(0.8);
      }
    });
  });

  describe("nominal and as-built pose generation", () => {
    it("generates valid pose datasets", async () => {
      const raw = await readJson<MuseumRawDataset>(
        "datasets/test_scan_pipeline/test_raw.json"
      );
      const constraints = await readJson<ConstraintsDataset>(
        "datasets/test_scan_pipeline/test_constraints.json"
      );

      const result = runPoseFromScanPipeline(raw, constraints, {
        ...DEFAULT_PIPELINE_CONFIG,
        tube_radius_mm: 50,
      });

      // Check nominal poses
      expect(result.nominal_poses.schema_version).toBe("v0.1");
      expect(result.nominal_poses.parts.length).toBe(3);
      for (const part of result.nominal_poses.parts) {
        expect(part.T_world_part_nominal.translation_mm).toHaveLength(3);
        expect(part.T_world_part_nominal.rotation_quat_xyzw).toHaveLength(4);
      }

      // Check as-built poses
      expect(result.asbuilt_poses.schema_version).toBe("v0.1");
      expect(result.asbuilt_poses.parts.length).toBe(3);
      for (const part of result.asbuilt_poses.parts) {
        expect(part.T_world_part_asBuilt.translation_mm).toHaveLength(3);
        expect(part.T_world_part_asBuilt.rotation_quat_xyzw).toHaveLength(4);
        expect(part.pose_confidence).toBeGreaterThan(0);
        expect(part.pose_confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
