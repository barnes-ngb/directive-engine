import type { Quat, Transform, Vec3 } from "../types.js";

import { norm, sub } from "../math/vec.js";
import { normalize } from "../math/quat.js";
import { applyTransformToPoint, rotateVec3ByQuat } from "./apply.js";

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
}

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
  // translation = centroid(model) - centroid(scan)
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

    // Apply translation-only transform: p_scan + translation
    const predictedX = sx + translation[0];
    const predictedY = sy + translation[1];
    const predictedZ = sz + translation[2];

    // Residual vector
    const rx = mx - predictedX;
    const ry = my - predictedY;
    const rz = mz - predictedZ;

    // Sum of squared residual norms
    sumSqResiduals += rx * rx + ry * ry + rz * rz;
  }

  return Math.sqrt(sumSqResiduals / modelPoints.length);
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((acc, value, index) => acc + value * vector[index], 0));
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
  if (magnitude === 0) {
    throw new Error("Degenerate geometry: unable to normalize eigenvector.");
  }
  return vector.map((value) => value / magnitude);
}

function covarianceEnergy(values: number[]): number {
  return Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));
}

function computeHornTransform(modelPoints: Vec3[], scanPoints: Vec3[]): Transform {
  if (modelPoints.length !== scanPoints.length) {
    throw new Error("Model and scan point lists must have the same length.");
  }
  if (modelPoints.length === 0) {
    return { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] };
  }

  const modelCentroid = centroid(modelPoints);
  const scanCentroid = centroid(scanPoints);

  let sxx = 0;
  let sxy = 0;
  let sxz = 0;
  let syx = 0;
  let syy = 0;
  let syz = 0;
  let szx = 0;
  let szy = 0;
  let szz = 0;

  // Build covariance matrix H = Σ (scan_centered * model_centered^T)
  // This gives rotation R such that R * scan_centered ≈ model_centered
  for (let i = 0; i < modelPoints.length; i++) {
    const [mx, my, mz] = sub(modelPoints[i], modelCentroid);
    const [sx, sy, sz] = sub(scanPoints[i], scanCentroid);

    // H_ij = Σ scan_i * model_j (outer product scan * model^T)
    sxx += sx * mx;
    sxy += sx * my;
    sxz += sx * mz;
    syx += sy * mx;
    syy += sy * my;
    syz += sy * mz;
    szx += sz * mx;
    szy += sz * my;
    szz += sz * mz;
  }

  const covarianceNorm = covarianceEnergy([sxx, sxy, sxz, syx, syy, syz, szx, szy, szz]);
  if (covarianceNorm === 0) {
    throw new Error("Degenerate geometry: covariance matrix is zero.");
  }

  const nMatrix = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];

  let quatVector = [1, 0, 0, 0];
  for (let i = 0; i < 200; i++) {
    quatVector = normalizeVector(multiplyMatrixVector(nMatrix, quatVector));
  }

  const [qw, qx, qy, qz] = quatVector;
  const rotation_quat_xyzw: Quat = normalize([qx, qy, qz, qw]);
  const rotatedScan = rotateVec3ByQuat(scanCentroid, rotation_quat_xyzw);
  const translation_mm = sub(modelCentroid, rotatedScan);

  return { translation_mm, rotation_quat_xyzw };
}

export function computeRigidTransform(
  scanPts: AnchorPoint[],
  modelPts: AnchorPoint[]
): RigidTransformResult {
  const modelById = new Map<string, Vec3>();
  for (const { anchor_id, point_mm } of modelPts) {
    if (modelById.has(anchor_id)) {
      throw new Error(`Duplicate model anchor id: ${anchor_id}`);
    }
    modelById.set(anchor_id, point_mm);
  }

  const scanById = new Map<string, Vec3>();
  for (const { anchor_id, point_mm } of scanPts) {
    if (scanById.has(anchor_id)) {
      throw new Error(`Duplicate scan anchor id: ${anchor_id}`);
    }
    scanById.set(anchor_id, point_mm);
  }

  const matched: { anchor_id: string; scanPoint: Vec3; modelPoint: Vec3 }[] = [];
  for (const [anchor_id, scanPoint] of scanById.entries()) {
    const modelPoint = modelById.get(anchor_id);
    if (!modelPoint) {
      continue;
    }
    matched.push({ anchor_id, scanPoint, modelPoint });
  }

  if (matched.length < 3) {
    throw new Error(`Rigid alignment requires at least 3 correspondences; found ${matched.length}.`);
  }

  const scanPoints = matched.map((entry) => entry.scanPoint);
  const modelPoints = matched.map((entry) => entry.modelPoint);

  // Compute initial RMS using translation-only alignment (before rigid transform)
  const rms_initial_mm = computeInitialRms(modelPoints, scanPoints);

  // Compute full rigid transform (rotation + translation)
  const T_model_scan = computeHornTransform(modelPoints, scanPoints);

  const residuals_mm: AnchorResidual[] = matched.map(({ anchor_id, scanPoint, modelPoint }) => {
    const predicted = applyTransformToPoint(T_model_scan, scanPoint);
    const residual_vec_mm = sub(modelPoint, predicted);
    return {
      anchor_id,
      residual_mm: norm(residual_vec_mm),
      residual_vec_mm
    };
  });

  const rms_mm = residuals_mm.length === 0
    ? 0
    : Math.sqrt(
        residuals_mm.reduce(
          (sum, residual) => sum + Math.pow(norm(residual.residual_vec_mm), 2),
          0
        ) / residuals_mm.length
      );

  return { T_model_scan, rms_mm, rms_initial_mm, residuals_mm };
}
