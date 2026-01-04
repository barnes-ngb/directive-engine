import { describe, it, expect } from "vitest";
import {
  fitLinePCA,
  computeCentroid,
  type LineFitResult,
} from "../core/scan/fitLine.js";
import { generateSyntheticLinePoints } from "../core/scan/synthetic.js";
import type { ScanPoint } from "../core/scan/segment.js";

describe("computeCentroid", () => {
  it("computes centroid of simple points", () => {
    const c = computeCentroid([
      [0, 0, 0],
      [10, 0, 0],
      [5, 10, 0],
    ]);
    expect(c[0]).toBeCloseTo(5, 6);
    expect(c[1]).toBeCloseTo(10 / 3, 6);
    expect(c[2]).toBeCloseTo(0, 6);
  });

  it("returns origin for empty array", () => {
    const c = computeCentroid([]);
    expect(c).toEqual([0, 0, 0]);
  });

  it("returns the point for single-point array", () => {
    const c = computeCentroid([[7, 8, 9]]);
    expect(c).toEqual([7, 8, 9]);
  });
});

describe("fitLinePCA", () => {
  it("throws for fewer than 2 points", () => {
    expect(() => fitLinePCA([{ point_mm: [0, 0, 0] }])).toThrow(
      "fitLinePCA requires at least 2 points"
    );
  });

  it("fits a perfect horizontal line with zero RMS", () => {
    const points: ScanPoint[] = [
      { point_mm: [0, 0, 0] },
      { point_mm: [5, 0, 0] },
      { point_mm: [10, 0, 0] },
    ];

    const result = fitLinePCA(points);

    expect(result.fit_rms_mm).toBeCloseTo(0, 6);
    expect(result.variance_explained).toBeCloseTo(1, 6);
    expect(result.point_count).toBe(3);

    // Direction should be along x-axis (or -x)
    expect(Math.abs(result.direction[0])).toBeCloseTo(1, 2);
    expect(result.direction[1]).toBeCloseTo(0, 2);
    expect(result.direction[2]).toBeCloseTo(0, 2);
  });

  it("fits a perfect vertical line", () => {
    const points: ScanPoint[] = [
      { point_mm: [0, 0, 0] },
      { point_mm: [0, 0, 100] },
      { point_mm: [0, 0, 200] },
    ];

    const result = fitLinePCA(points);

    expect(result.fit_rms_mm).toBeCloseTo(0, 6);

    // Direction should be along z-axis (or -z)
    expect(result.direction[0]).toBeCloseTo(0, 2);
    expect(result.direction[1]).toBeCloseTo(0, 2);
    expect(Math.abs(result.direction[2])).toBeCloseTo(1, 2);
  });

  it("produces reasonable RMS for noisy line", () => {
    // Generate synthetic points with known noise level
    const points = generateSyntheticLinePoints(
      [0, 0, 0],
      [0, 0, 1000],
      {
        num_points: 100,
        noise_perpendicular_mm: 3,
        noise_along_mm: 0.5,
        seed: 12345, // Fixed seed for reproducibility
      }
    );

    const result = fitLinePCA(points);

    // RMS should be around the noise level
    expect(result.fit_rms_mm).toBeGreaterThan(1);
    expect(result.fit_rms_mm).toBeLessThan(10);
    expect(result.variance_explained).toBeGreaterThan(0.99);
  });

  it("computes correct line endpoints", () => {
    const points: ScanPoint[] = [
      { point_mm: [0, 0, 0] },
      { point_mm: [50, 0, 0] },
      { point_mm: [100, 0, 0] },
    ];

    const result = fitLinePCA(points);

    // Line should span from ~0 to ~100 in x
    const x0 = result.line_p0[0];
    const x1 = result.line_p1[0];
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);

    expect(minX).toBeCloseTo(0, 0);
    expect(maxX).toBeCloseTo(100, 0);
  });

  it("centroid is at the middle of the line", () => {
    const points: ScanPoint[] = [
      { point_mm: [0, 0, 0] },
      { point_mm: [100, 0, 0] },
    ];

    const result = fitLinePCA(points);

    expect(result.centroid[0]).toBeCloseTo(50, 6);
    expect(result.centroid[1]).toBeCloseTo(0, 6);
    expect(result.centroid[2]).toBeCloseTo(0, 6);
  });
});
