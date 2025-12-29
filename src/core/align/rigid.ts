import type { Transform, Vec3 } from "../types.js";

import { norm, sub } from "../math/vec.js";
import { normalize } from "../math/quat.js";
import { applyTransformToPoint } from "./apply.js";

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

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((acc, value, index) => acc + value * vector[index], 0));
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
  if (magnitude === 0) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / magnitude);
}

function computeKabschTransform(sourcePoints: Vec3[], targetPoints: Vec3[]): Transform {
  if (sourcePoints.length !== targetPoints.length) {
    throw new Error("Source and target point lists must have the same length.");
  }
  if (sourcePoints.length === 0) {
    return { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] };
  }

  const sourceCentroid = centroid(sourcePoints);
  const targetCentroid = centroid(targetPoints);

  let sxx = 0;
  let sxy = 0;
  let sxz = 0;
  let syx = 0;
  let syy = 0;
  let syz = 0;
  let szx = 0;
  let szy = 0;
  let szz = 0;

  for (let i = 0; i < sourcePoints.length; i++) {
    const [px, py, pz] = sub(sourcePoints[i], sourceCentroid);
    const [qx, qy, qz] = sub(targetPoints[i], targetCentroid);

    sxx += px * qx;
    sxy += px * qy;
    sxz += px * qz;
    syx += py * qx;
    syy += py * qy;
    syz += py * qz;
    szx += pz * qx;
    szy += pz * qy;
    szz += pz * qz;
  }

  const nMatrix = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];

  let quatVector = [1, 0, 0, 0];
  for (let i = 0; i < 80; i++) {
    quatVector = normalizeVector(multiplyMatrixVector(nMatrix, quatVector));
  }

  const [qw, qx, qy, qz] = quatVector;
  const rotation_quat_xyzw = normalize([qx, qy, qz, qw]);
  const rotatedSource = applyTransformToPoint(sourceCentroid, {
    translation_mm: [0, 0, 0],
    rotation_quat_xyzw
  });
  const translation_mm = sub(targetCentroid, rotatedSource);

  return { translation_mm, rotation_quat_xyzw };
}

export function computeRigidTransform(
  scanPts: AnchorPoint[],
  modelPts: AnchorPoint[]
): RigidTransformResult {
  if (scanPts.length !== modelPts.length) {
    throw new Error("Scan and model anchor lists must have the same length.");
  }

  const modelById = new Map<string, Vec3>();
  for (const { anchor_id, point_mm } of modelPts) {
    if (modelById.has(anchor_id)) {
      throw new Error(`Duplicate model anchor id: ${anchor_id}`);
    }
    modelById.set(anchor_id, point_mm);
  }

  const scanPoints: Vec3[] = [];
  const modelPoints: Vec3[] = [];
  for (const { anchor_id, point_mm } of scanPts) {
    const modelPoint = modelById.get(anchor_id);
    if (!modelPoint) {
      throw new Error(`Missing model anchor for id: ${anchor_id}`);
    }
    scanPoints.push(point_mm);
    modelPoints.push(modelPoint);
  }

  const T_model_scan = computeKabschTransform(scanPoints, modelPoints);

  const residuals_mm: AnchorResidual[] = scanPts.map(({ anchor_id, point_mm }) => {
    const modelPoint = modelById.get(anchor_id) as Vec3;
    const predicted = applyTransformToPoint(point_mm, T_model_scan);
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
        residuals_mm.reduce((sum, residual) => sum + residual.residual_mm * residual.residual_mm, 0)
          / residuals_mm.length
      );

  return { T_model_scan, rms_mm, residuals_mm };
}
