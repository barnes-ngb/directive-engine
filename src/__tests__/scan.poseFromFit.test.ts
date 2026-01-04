import { describe, it, expect } from "vitest";
import {
  poseFromLineFit,
  directionToQuaternion,
  directionToQuaternionFull,
  DEFAULT_CONFIDENCE_CONFIG,
} from "../core/scan/poseFromFit.js";
import type { LineFitResult } from "../core/scan/fitLine.js";

describe("directionToQuaternion (MVP)", () => {
  it("returns identity quaternion for any direction", () => {
    const q = directionToQuaternion([1, 0, 0]);
    expect(q).toEqual([0, 0, 0, 1]);
  });
});

describe("directionToQuaternionFull", () => {
  it("returns identity for z-axis aligned direction", () => {
    const q = directionToQuaternionFull([0, 0, 1]);
    expect(q).toEqual([0, 0, 0, 1]);
  });

  it("returns 180-degree rotation for negative z", () => {
    const q = directionToQuaternionFull([0, 0, -1]);
    // Should be 180 degrees around x-axis: [1, 0, 0, 0]
    expect(q[0]).toBeCloseTo(1, 2);
    expect(q[1]).toBeCloseTo(0, 2);
    expect(q[2]).toBeCloseTo(0, 2);
    expect(q[3]).toBeCloseTo(0, 2);
  });

  it("computes valid unit quaternion for arbitrary direction", () => {
    const q = directionToQuaternionFull([1, 0, 0]);

    // Quaternion should be normalized
    const mag = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    expect(mag).toBeCloseTo(1, 6);
  });
});

describe("poseFromLineFit", () => {
  it("computes pose translation as line midpoint", () => {
    const fit: LineFitResult = {
      centroid: [100, 200, 500],
      direction: [0, 0, 1],
      fit_rms_mm: 2,
      point_count: 100,
      variance_explained: 0.99,
      line_p0: [100, 200, 0],
      line_p1: [100, 200, 1000],
    };

    const result = poseFromLineFit(fit);

    // Midpoint should be at z=500
    expect(result.T_world_part_asBuilt.translation_mm[0]).toBeCloseTo(100, 6);
    expect(result.T_world_part_asBuilt.translation_mm[1]).toBeCloseTo(200, 6);
    expect(result.T_world_part_asBuilt.translation_mm[2]).toBeCloseTo(500, 6);
  });

  it("returns identity rotation for MVP", () => {
    const fit: LineFitResult = {
      centroid: [0, 0, 0],
      direction: [1, 0, 0],
      fit_rms_mm: 2,
      point_count: 100,
      variance_explained: 0.99,
      line_p0: [0, 0, 0],
      line_p1: [100, 0, 0],
    };

    const result = poseFromLineFit(fit);

    expect(result.T_world_part_asBuilt.rotation_quat_xyzw).toEqual([0, 0, 0, 1]);
  });

  it("computes high confidence for good fit", () => {
    const fit: LineFitResult = {
      centroid: [0, 0, 500],
      direction: [0, 0, 1],
      fit_rms_mm: 1, // Excellent RMS
      point_count: 150, // Many points
      variance_explained: 0.999, // High variance explained
      line_p0: [0, 0, 0],
      line_p1: [0, 0, 1000],
    };

    const result = poseFromLineFit(fit);

    expect(result.pose_confidence).toBeGreaterThan(0.9);
    expect(result.confidence_notes).toBe("Good fit quality");
  });

  it("computes low confidence for poor fit", () => {
    const fit: LineFitResult = {
      centroid: [0, 0, 500],
      direction: [0, 0, 1],
      fit_rms_mm: 15, // Poor RMS (beyond threshold)
      point_count: 5, // Few points
      variance_explained: 0.5, // Low variance explained
      line_p0: [0, 0, 0],
      line_p1: [0, 0, 1000],
    };

    const result = poseFromLineFit(fit);

    expect(result.pose_confidence).toBeLessThan(0.5);
    expect(result.confidence_notes).toContain("Reduced confidence");
  });

  it("includes fit metrics in result", () => {
    const fit: LineFitResult = {
      centroid: [0, 0, 500],
      direction: [0, 0, 1],
      fit_rms_mm: 3,
      point_count: 50,
      variance_explained: 0.95,
      line_p0: [0, 0, 0],
      line_p1: [0, 0, 1000],
    };

    const result = poseFromLineFit(fit);

    expect(result.fit_metrics.fit_rms_mm).toBe(3);
    expect(result.fit_metrics.point_count).toBe(50);
    expect(result.fit_metrics.variance_explained).toBe(0.95);
    expect(result.fit_metrics.line_length_mm).toBeCloseTo(1000, 0);
  });

  it("respects custom confidence config", () => {
    const fit: LineFitResult = {
      centroid: [0, 0, 0],
      direction: [0, 0, 1],
      fit_rms_mm: 5, // Moderate RMS
      point_count: 50,
      variance_explained: 0.9,
      line_p0: [0, 0, 0],
      line_p1: [0, 0, 100],
    };

    // With strict config, this should be low confidence
    const strictConfig = {
      ...DEFAULT_CONFIDENCE_CONFIG,
      rms_excellent_mm: 1,
      rms_poor_mm: 3,
    };

    const result = poseFromLineFit(fit, strictConfig);

    // RMS of 5 is beyond "poor" threshold of 3, so RMS contribution is 0
    expect(result.pose_confidence).toBeLessThan(0.7);
  });
});
