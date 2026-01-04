/**
 * Point cloud segmentation: filter scan points within a tube around a nominal line.
 */

import type { Vec3 } from "../types.js";
import { sub, add, scale, norm } from "../math/vec.js";

export interface ScanPoint {
  point_mm: Vec3;
  intensity?: number;
}

export interface SegmentationResult {
  /** Points that passed the tube filter */
  inliers: ScanPoint[];
  /** Points that were rejected */
  outliers: ScanPoint[];
  /** Number of inlier points */
  inlier_count: number;
  /** Inlier ratio (inliers / total) */
  inlier_ratio: number;
}

/**
 * Compute the perpendicular distance from a point to a line defined by two points.
 *
 * @param point The point to measure from
 * @param lineP0 First point on the line
 * @param lineP1 Second point on the line
 * @returns Distance in mm
 */
export function pointToLineDistance(point: Vec3, lineP0: Vec3, lineP1: Vec3): number {
  // Line direction vector
  const d = sub(lineP1, lineP0);
  const lineLen = norm(d);

  if (lineLen < 1e-9) {
    // Degenerate line (p0 == p1), return distance to the point
    return norm(sub(point, lineP0));
  }

  // Normalized direction
  const dNorm = scale(d, 1 / lineLen);

  // Vector from p0 to the point
  const v = sub(point, lineP0);

  // Project v onto the line direction
  const proj = v[0] * dNorm[0] + v[1] * dNorm[1] + v[2] * dNorm[2];

  // Closest point on the infinite line
  const closest = add(lineP0, scale(dNorm, proj));

  // Distance from point to closest
  return norm(sub(point, closest));
}

/**
 * Check if a point's projection falls within the line segment (not just the infinite line).
 *
 * @param point The point to check
 * @param lineP0 First endpoint of the line segment
 * @param lineP1 Second endpoint of the line segment
 * @returns True if the projection is within the segment bounds
 */
export function isProjectionWithinSegment(point: Vec3, lineP0: Vec3, lineP1: Vec3): boolean {
  const d = sub(lineP1, lineP0);
  const lineLen = norm(d);

  if (lineLen < 1e-9) return true;

  const v = sub(point, lineP0);
  const dNorm = scale(d, 1 / lineLen);
  const proj = v[0] * dNorm[0] + v[1] * dNorm[1] + v[2] * dNorm[2];

  // Allow some margin beyond endpoints (10% of line length)
  const margin = lineLen * 0.1;
  return proj >= -margin && proj <= lineLen + margin;
}

export interface SegmentOptions {
  /** Maximum distance from line to include point (mm) */
  tubeRadius_mm: number;
  /** If true, only include points whose projection is within the segment bounds */
  enforceSegmentBounds?: boolean;
}

/**
 * Segment scan points by filtering those within a cylindrical tube around a nominal line.
 *
 * @param scanPoints All scan points (in model frame after rigid transform)
 * @param nominalLineP0 First endpoint of the nominal line
 * @param nominalLineP1 Second endpoint of the nominal line
 * @param options Segmentation parameters
 * @returns Segmentation result with inliers and outliers
 */
export function segmentPointsNearLine(
  scanPoints: ScanPoint[],
  nominalLineP0: Vec3,
  nominalLineP1: Vec3,
  options: SegmentOptions
): SegmentationResult {
  const { tubeRadius_mm, enforceSegmentBounds = true } = options;

  const inliers: ScanPoint[] = [];
  const outliers: ScanPoint[] = [];

  for (const pt of scanPoints) {
    const dist = pointToLineDistance(pt.point_mm, nominalLineP0, nominalLineP1);
    const withinTube = dist <= tubeRadius_mm;
    const withinBounds = !enforceSegmentBounds ||
      isProjectionWithinSegment(pt.point_mm, nominalLineP0, nominalLineP1);

    if (withinTube && withinBounds) {
      inliers.push(pt);
    } else {
      outliers.push(pt);
    }
  }

  const total = scanPoints.length;
  return {
    inliers,
    outliers,
    inlier_count: inliers.length,
    inlier_ratio: total > 0 ? inliers.length / total : 0,
  };
}
