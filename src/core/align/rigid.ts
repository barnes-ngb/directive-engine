/**
 * Rigid transform computation using Horn's method.
 *
 * Computes the optimal rigid transformation (rotation + translation) that
 * aligns scan points to model points using quaternion-based least squares.
 */
import type { Quat, Transform, Vec3 } from "../types.js";
import { norm, sub } from "../math/vec.js";
import { normalize } from "../math/quat.js";
import { applyTransformToPoint, rotateVec3ByQuat } from "./apply.js";
import {
  POWER_ITERATION_MAX_ITERS,
  POWER_ITERATION_CONVERGENCE,
  EPS_VECTOR_NORM
} from "../constants.js";
import { RigidAlignmentError } from "../errors.js";

// ============================================================================
// Types
// ============================================================================

export interface AnchorPoint {
  anchor_id: string;
  point_mm: Vec3;
}

export interface AnchorResidual {
  anchor_id: string;
  residual_mm: number;
  residual_vec_mm: Vec3;
}

export interface RigidTransformResult {
  T_model_scan: Transform;
  rms_mm: number;
  rms_initial_mm: number;
  residuals_mm: AnchorResidual[];
  /** Number of power iterations performed (for diagnostics) */
  iterations?: number;
  /** True if power iteration converged before max iterations */
  converged?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute the centroid (geometric center) of a set of points.
 */
function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) {
    return [0, 0, 0];
  }
  const sum: Vec3 = [0, 0, 0];
  for (const [x, y, z] of points) {
    sum[0] += x;
    sum[1] += y;
    sum[2] += z;
  }
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

/**
 * Compute initial RMS using translation-only alignment (identity rotation).
 * T0: rotation = identity, translation = centroid(model) - centroid(scan)
 * residuals r0 = p_model - apply(T0, p_scan) in model frame
 * RMS0 = sqrt(mean of ||r0||^2)
 */
function computeInitialRms(modelPoints: Vec3[], scanPoints: Vec3[]): number {
  if (modelPoints.length === 0 || modelPoints.length !== scanPoints.length) {
    return 0;
  }

  const modelCentroid = centroid(modelPoints);
  const scanCentroid = centroid(scanPoints);

  // T0: translation-only alignment (identity rotation)
  const translation: Vec3 = [
    modelCentroid[0] - scanCentroid[0],
    modelCentroid[1] - scanCentroid[1],
    modelCentroid[2] - scanCentroid[2]
  ];

  // Compute residuals: r0 = p_model - (p_scan + translation)
  let sumSqResiduals = 0;
  for (let i = 0; i < modelPoints.length; i++) {
    const [mx, my, mz] = modelPoints[i];
    const [sx, sy, sz] = scanPoints[i];

    const predictedX = sx + translation[0];
    const predictedY = sy + translation[1];
    const predictedZ = sz + translation[2];

    const rx = mx - predictedX;
    const ry = my - predictedY;
    const rz = mz - predictedZ;

    sumSqResiduals += rx * rx + ry * ry + rz * rz;
  }

  return Math.sqrt(sumSqResiduals / modelPoints.length);
}

/**
 * Multiply a 4x4 matrix by a 4-element vector.
 */
function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((acc, value, index) => acc + value * vector[index], 0));
}

/**
 * Normalize a vector to unit length.
 * @throws RigidAlignmentError if vector has zero magnitude
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
  if (magnitude < EPS_VECTOR_NORM) {
    throw new RigidAlignmentError(
      "Degenerate geometry: unable to normalize eigenvector.",
      "degenerate_geometry"
    );
  }
  return vector.map((value) => value / magnitude);
}

/**
 * Compute the Frobenius norm (energy) of covariance matrix elements.
 */
function covarianceEnergy(values: number[]): number {
  return Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));
}

/**
 * Compute the squared distance between two vectors.
 */
function vectorDistanceSquared(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Compute Horn's rigid transform using power iteration for eigenvector.
 *
 * @param modelPoints - Target points in model frame
 * @param scanPoints - Source points in scan frame (to be transformed)
 * @returns Transform that maps scan points to model frame
 * @throws RigidAlignmentError if geometry is degenerate or convergence fails
 */
function computeHornTransform(
  modelPoints: Vec3[],
  scanPoints: Vec3[]
): { transform: Transform; iterations: number; converged: boolean } {
  if (modelPoints.length !== scanPoints.length) {
    throw new RigidAlignmentError(
      "Model and scan point lists must have the same length.",
      "degenerate_geometry",
      modelPoints.length
    );
  }
  if (modelPoints.length === 0) {
    return {
      transform: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
      iterations: 0,
      converged: true
    };
  }

  const modelCentroid = centroid(modelPoints);
  const scanCentroid = centroid(scanPoints);

  // Build covariance matrix H = Σ (scan_centered * model_centered^T)
  let sxx = 0, sxy = 0, sxz = 0;
  let syx = 0, syy = 0, syz = 0;
  let szx = 0, szy = 0, szz = 0;

  for (let i = 0; i < modelPoints.length; i++) {
    const [mx, my, mz] = sub(modelPoints[i], modelCentroid);
    const [sx, sy, sz] = sub(scanPoints[i], scanCentroid);

    sxx += sx * mx; sxy += sx * my; sxz += sx * mz;
    syx += sy * mx; syy += sy * my; syz += sy * mz;
    szx += sz * mx; szy += sz * my; szz += sz * mz;
  }

  const covarianceNorm = covarianceEnergy([sxx, sxy, sxz, syx, syy, syz, szx, szy, szz]);
  if (covarianceNorm < EPS_VECTOR_NORM) {
    throw new RigidAlignmentError(
      "Degenerate geometry: covariance matrix is zero (points may be coincident).",
      "degenerate_geometry",
      modelPoints.length
    );
  }

  // Build the N matrix for quaternion eigenvector extraction
  const nMatrix = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];

  // Power iteration to find dominant eigenvector
  let quatVector = [1, 0, 0, 0];
  let iterations = 0;
  let converged = false;

  for (let i = 0; i < POWER_ITERATION_MAX_ITERS; i++) {
    const prevVector = quatVector;
    quatVector = normalizeVector(multiplyMatrixVector(nMatrix, quatVector));
    iterations = i + 1;

    // Check convergence: compare with previous iteration
    const changeSquared = vectorDistanceSquared(quatVector, prevVector);
    if (changeSquared < POWER_ITERATION_CONVERGENCE * POWER_ITERATION_CONVERGENCE) {
      converged = true;
      break;
    }
  }

  const [qw, qx, qy, qz] = quatVector;
  const rotation_quat_xyzw: Quat = normalize([qx, qy, qz, qw]);
  const rotatedScan = rotateVec3ByQuat(scanCentroid, rotation_quat_xyzw);
  const translation_mm = sub(modelCentroid, rotatedScan);

  return {
    transform: { translation_mm, rotation_quat_xyzw },
    iterations,
    converged
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Compute the optimal rigid transformation that aligns scan anchor points
 * to model anchor points.
 *
 * Uses Horn's method (quaternion-based least squares) to find the rotation
 * and translation that minimizes the sum of squared residuals.
 *
 * @param scanPts - Anchor points in scan coordinate frame
 * @param modelPts - Corresponding anchor points in model coordinate frame
 * @returns Rigid transform result with RMS error and per-anchor residuals
 *
 * @throws RigidAlignmentError if:
 *   - Fewer than 3 anchor correspondences are found
 *   - Duplicate anchor IDs are present
 *   - Geometry is degenerate (collinear/coincident points)
 *
 * @example
 * ```ts
 * const result = computeRigidTransform(
 *   [{ anchor_id: "A1", point_mm: [0, 0, 0] }, ...],
 *   [{ anchor_id: "A1", point_mm: [10, 0, 0] }, ...]
 * );
 * console.log(`RMS: ${result.rms_mm} mm`);
 * ```
 */
export function computeRigidTransform(
  scanPts: AnchorPoint[],
  modelPts: AnchorPoint[]
): RigidTransformResult {
  // Build lookup maps and check for duplicates
  const modelById = new Map<string, Vec3>();
  for (const { anchor_id, point_mm } of modelPts) {
    if (modelById.has(anchor_id)) {
      throw new RigidAlignmentError(
        `Duplicate model anchor id: ${anchor_id}`,
        "degenerate_geometry",
        modelPts.length
      );
    }
    modelById.set(anchor_id, point_mm);
  }

  const scanById = new Map<string, Vec3>();
  for (const { anchor_id, point_mm } of scanPts) {
    if (scanById.has(anchor_id)) {
      throw new RigidAlignmentError(
        `Duplicate scan anchor id: ${anchor_id}`,
        "degenerate_geometry",
        scanPts.length
      );
    }
    scanById.set(anchor_id, point_mm);
  }

  // Find matched correspondences
  const matched: { anchor_id: string; scanPoint: Vec3; modelPoint: Vec3 }[] = [];
  for (const [anchor_id, scanPoint] of scanById.entries()) {
    const modelPoint = modelById.get(anchor_id);
    if (!modelPoint) {
      continue;
    }
    matched.push({ anchor_id, scanPoint, modelPoint });
  }

  if (matched.length < 3) {
    throw new RigidAlignmentError(
      `Rigid alignment requires at least 3 correspondences; found ${matched.length}.`,
      "insufficient_anchors",
      matched.length
    );
  }

  const scanPoints = matched.map((entry) => entry.scanPoint);
  const modelPoints = matched.map((entry) => entry.modelPoint);

  // Compute initial RMS using translation-only alignment
  const rms_initial_mm = computeInitialRms(modelPoints, scanPoints);

  // Compute full rigid transform
  const { transform: T_model_scan, iterations, converged } = computeHornTransform(modelPoints, scanPoints);

  // Compute per-anchor residuals
  const residuals_mm: AnchorResidual[] = matched.map(({ anchor_id, scanPoint, modelPoint }) => {
    const predicted = applyTransformToPoint(T_model_scan, scanPoint);
    const residual_vec_mm = sub(modelPoint, predicted);
    return {
      anchor_id,
      residual_mm: norm(residual_vec_mm),
      residual_vec_mm
    };
  });

  // Compute final RMS
  const rms_mm = residuals_mm.length === 0
    ? 0
    : Math.sqrt(
        residuals_mm.reduce(
          (sum, residual) => sum + Math.pow(norm(residual.residual_vec_mm), 2),
          0
        ) / residuals_mm.length
      );

  return {
    T_model_scan,
    rms_mm,
    rms_initial_mm,
    residuals_mm,
    iterations,
    converged
  };
}
