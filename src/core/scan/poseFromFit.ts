/**
 * Convert a line fit result into an as-built pose with confidence scoring.
 */

import type { Vec3, Quat, Transform } from "../types.js";
import { add, scale, norm, sub } from "../math/vec.js";
import type { LineFitResult } from "./fitLine.js";

export interface PoseFromFitResult {
  /** As-built pose transform */
  T_world_part_asBuilt: Transform;
  /** Pose confidence score (0-1) */
  pose_confidence: number;
  /** Notes explaining the confidence score */
  confidence_notes: string;
  /** Fit metrics for reference */
  fit_metrics: {
    fit_rms_mm: number;
    point_count: number;
    variance_explained: number;
    line_length_mm: number;
  };
}

export interface ConfidenceConfig {
  /** Maximum RMS error for full confidence (mm) */
  rms_excellent_mm: number;
  /** RMS error at which confidence drops to 0.5 (mm) */
  rms_poor_mm: number;
  /** Minimum point count for full confidence */
  min_points_excellent: number;
  /** Point count at which confidence drops to 0.5 */
  min_points_poor: number;
  /** Weight for RMS in confidence calculation (0-1) */
  weight_rms: number;
  /** Weight for point count in confidence calculation (0-1) */
  weight_points: number;
  /** Weight for variance explained in confidence calculation (0-1) */
  weight_variance: number;
}

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  rms_excellent_mm: 2,
  rms_poor_mm: 10,
  min_points_excellent: 100,
  min_points_poor: 10,
  weight_rms: 0.4,
  weight_points: 0.3,
  weight_variance: 0.3,
};

/**
 * Compute confidence factor for RMS (1.0 for excellent, 0 for very poor).
 */
function rmsConfidence(rms_mm: number, config: ConfidenceConfig): number {
  if (rms_mm <= config.rms_excellent_mm) {
    return 1.0;
  }
  if (rms_mm >= config.rms_poor_mm) {
    return 0.0;
  }
  // Linear interpolation
  const t = (rms_mm - config.rms_excellent_mm) / (config.rms_poor_mm - config.rms_excellent_mm);
  return 1.0 - t;
}

/**
 * Compute confidence factor for point count.
 */
function pointCountConfidence(count: number, config: ConfidenceConfig): number {
  if (count >= config.min_points_excellent) {
    return 1.0;
  }
  if (count <= config.min_points_poor) {
    return 0.0;
  }
  // Linear interpolation
  const t =
    (count - config.min_points_poor) /
    (config.min_points_excellent - config.min_points_poor);
  return t;
}

/**
 * Compute a rotation quaternion that aligns the Z-axis with the given direction.
 * For MVP, we return identity quaternion since mullions are primarily translational.
 *
 * @param direction Unit vector representing the line direction
 * @returns Quaternion [x, y, z, w]
 */
export function directionToQuaternion(direction: Vec3): Quat {
  // MVP: Return identity quaternion
  // Future enhancement: compute rotation from [0,0,1] to direction
  return [0, 0, 0, 1];
}

/**
 * Compute a rotation quaternion that aligns the Z-axis with the given direction.
 * This version computes an actual rotation.
 *
 * @param direction Unit vector representing the line direction
 * @returns Quaternion [x, y, z, w]
 */
export function directionToQuaternionFull(direction: Vec3): Quat {
  // Reference axis (Z-axis)
  const zAxis: Vec3 = [0, 0, 1];

  // Compute dot product
  const dot = direction[0] * zAxis[0] + direction[1] * zAxis[1] + direction[2] * zAxis[2];

  // Check if vectors are parallel or anti-parallel
  if (dot > 0.9999) {
    // Already aligned with Z
    return [0, 0, 0, 1];
  }
  if (dot < -0.9999) {
    // Anti-parallel: rotate 180 degrees around X axis
    return [1, 0, 0, 0];
  }

  // Compute rotation axis via cross product
  const axis: Vec3 = [
    zAxis[1] * direction[2] - zAxis[2] * direction[1],
    zAxis[2] * direction[0] - zAxis[0] * direction[2],
    zAxis[0] * direction[1] - zAxis[1] * direction[0],
  ];

  // Normalize the axis
  const axisLen = norm(axis);
  const axisNorm: Vec3 = axisLen > 1e-9 ? scale(axis, 1 / axisLen) as Vec3 : [1, 0, 0];

  // Compute rotation angle
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Build quaternion from axis-angle
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  const c = Math.cos(halfAngle);

  return [axisNorm[0] * s, axisNorm[1] * s, axisNorm[2] * s, c];
}

/**
 * Convert a line fit result into an as-built pose with confidence.
 *
 * @param fit The line fit result from PCA
 * @param config Optional confidence calculation configuration
 * @returns Pose and confidence
 */
export function poseFromLineFit(
  fit: LineFitResult,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): PoseFromFitResult {
  // Translation: midpoint of the fitted line
  const midpoint = scale(add(fit.line_p0, fit.line_p1), 0.5) as Vec3;

  // Rotation: identity for MVP (direction-based rotation available via directionToQuaternionFull)
  const rotation = directionToQuaternion(fit.direction);

  // Compute line length
  const line_length_mm = norm(sub(fit.line_p1, fit.line_p0));

  // Compute confidence components
  const rmsConf = rmsConfidence(fit.fit_rms_mm, config);
  const pointConf = pointCountConfidence(fit.point_count, config);
  const varianceConf = fit.variance_explained; // Already 0-1

  // Weighted average
  const totalWeight = config.weight_rms + config.weight_points + config.weight_variance;
  const pose_confidence =
    (rmsConf * config.weight_rms +
      pointConf * config.weight_points +
      varianceConf * config.weight_variance) /
    totalWeight;

  // Build confidence notes
  const notes: string[] = [];
  if (rmsConf < 0.5) notes.push(`high RMS (${fit.fit_rms_mm.toFixed(1)}mm)`);
  if (pointConf < 0.5) notes.push(`low point count (${fit.point_count})`);
  if (varianceConf < 0.8) notes.push(`low variance explained (${(varianceConf * 100).toFixed(0)}%)`);

  const confidence_notes =
    notes.length > 0 ? `Reduced confidence due to: ${notes.join(", ")}` : "Good fit quality";

  return {
    T_world_part_asBuilt: {
      translation_mm: midpoint,
      rotation_quat_xyzw: rotation,
    },
    pose_confidence,
    confidence_notes,
    fit_metrics: {
      fit_rms_mm: fit.fit_rms_mm,
      point_count: fit.point_count,
      variance_explained: fit.variance_explained,
      line_length_mm,
    },
  };
}
