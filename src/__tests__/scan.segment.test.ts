import { describe, it, expect } from "vitest";
import {
  pointToLineDistance,
  isProjectionWithinSegment,
  segmentPointsNearLine,
  type ScanPoint,
} from "../core/scan/segment.js";

describe("pointToLineDistance", () => {
  it("returns 0 for point on line", () => {
    const dist = pointToLineDistance([5, 0, 0], [0, 0, 0], [10, 0, 0]);
    expect(dist).toBeCloseTo(0, 6);
  });

  it("returns correct distance for point perpendicular to line", () => {
    const dist = pointToLineDistance([5, 3, 0], [0, 0, 0], [10, 0, 0]);
    expect(dist).toBeCloseTo(3, 6);
  });

  it("works with 3D offset", () => {
    const dist = pointToLineDistance([5, 3, 4], [0, 0, 0], [10, 0, 0]);
    expect(dist).toBeCloseTo(5, 6); // sqrt(3^2 + 4^2) = 5
  });

  it("handles vertical line", () => {
    const dist = pointToLineDistance([3, 0, 50], [0, 0, 0], [0, 0, 100]);
    expect(dist).toBeCloseTo(3, 6);
  });

  it("handles degenerate line (p0 == p1)", () => {
    const dist = pointToLineDistance([3, 4, 0], [0, 0, 0], [0, 0, 0]);
    expect(dist).toBeCloseTo(5, 6); // distance to the single point
  });
});

describe("isProjectionWithinSegment", () => {
  it("returns true for point projecting onto middle of segment", () => {
    const result = isProjectionWithinSegment([5, 3, 0], [0, 0, 0], [10, 0, 0]);
    expect(result).toBe(true);
  });

  it("returns true for point at start of segment (within margin)", () => {
    const result = isProjectionWithinSegment([0, 3, 0], [0, 0, 0], [10, 0, 0]);
    expect(result).toBe(true);
  });

  it("returns false for point projecting well beyond segment end", () => {
    const result = isProjectionWithinSegment([20, 3, 0], [0, 0, 0], [10, 0, 0]);
    expect(result).toBe(false);
  });

  it("returns false for point projecting well before segment start", () => {
    const result = isProjectionWithinSegment([-20, 3, 0], [0, 0, 0], [10, 0, 0]);
    expect(result).toBe(false);
  });
});

describe("segmentPointsNearLine", () => {
  it("filters points within tube radius", () => {
    const points: ScanPoint[] = [
      { point_mm: [5, 0, 0] },   // on line
      { point_mm: [5, 2, 0] },   // 2mm off
      { point_mm: [5, 5, 0] },   // 5mm off
      { point_mm: [5, 10, 0] },  // 10mm off - outlier
    ];

    const result = segmentPointsNearLine(
      points,
      [0, 0, 0],
      [10, 0, 0],
      { tubeRadius_mm: 6 }
    );

    expect(result.inlier_count).toBe(3);
    expect(result.outliers.length).toBe(1);
    expect(result.inlier_ratio).toBeCloseTo(0.75, 2);
  });

  it("respects segment bounds when enforceSegmentBounds is true", () => {
    const points: ScanPoint[] = [
      { point_mm: [5, 0, 0] },   // in segment
      { point_mm: [-50, 0, 0] }, // before segment
      { point_mm: [50, 0, 0] },  // after segment
    ];

    const result = segmentPointsNearLine(
      points,
      [0, 0, 0],
      [10, 0, 0],
      { tubeRadius_mm: 10, enforceSegmentBounds: true }
    );

    expect(result.inlier_count).toBe(1);
  });

  it("ignores segment bounds when enforceSegmentBounds is false", () => {
    const points: ScanPoint[] = [
      { point_mm: [5, 0, 0] },   // in segment
      { point_mm: [-50, 0, 0] }, // before segment
      { point_mm: [50, 0, 0] },  // after segment
    ];

    const result = segmentPointsNearLine(
      points,
      [0, 0, 0],
      [10, 0, 0],
      { tubeRadius_mm: 10, enforceSegmentBounds: false }
    );

    expect(result.inlier_count).toBe(3);
  });

  it("handles empty input", () => {
    const result = segmentPointsNearLine(
      [],
      [0, 0, 0],
      [10, 0, 0],
      { tubeRadius_mm: 5 }
    );

    expect(result.inlier_count).toBe(0);
    expect(result.inlier_ratio).toBe(0);
  });
});
