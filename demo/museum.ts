import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../src/types.js";

export type MuseumAnchor = {
  anchor_id: string;
  model_mm: Vec3;
  scan_mm: Vec3;
};

export type MuseumRawPartPose = {
  part_id: string;
  part_name: string;
  part_type: string;
  T_model_part_nominal: Transform;
  T_scan_part_asBuilt: Transform;
  pose_confidence: number;
  confidence_notes?: string;
};

export type MuseumRawDataset = {
  schema_version: "museum_raw_v0.1";
  dataset_id: string;
  measured_at: string;
  units: { length: "mm"; rotation: "quaternion_xyzw" };
  anchors: MuseumAnchor[];
  parts: MuseumRawPartPose[];
};

export type AnchorResidual = {
  anchor_id: string;
  residual_mm_vec: Vec3;
  residual_norm_mm: number;
};

type DatasetPaths = {
  raw: string;
  constraints: string;
};

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecScale(a: Vec3, scale: number): Vec3 {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

function vecNorm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalizeQuat(quat: Quat): Quat {
  const norm = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
  if (norm === 0) return [0, 0, 0, 1];
  return [quat[0] / norm, quat[1] / norm, quat[2] / norm, quat[3] / norm];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function rotateVecByQuat(vec: Vec3, quat: Quat): Vec3 {
  const [x, y, z, w] = normalizeQuat(quat);
  const qVec: Vec3 = [x, y, z];
  const uv = [
    qVec[1] * vec[2] - qVec[2] * vec[1],
    qVec[2] * vec[0] - qVec[0] * vec[2],
    qVec[0] * vec[1] - qVec[1] * vec[0]
  ] satisfies Vec3;
  const uuv = [
    qVec[1] * uv[2] - qVec[2] * uv[1],
    qVec[2] * uv[0] - qVec[0] * uv[2],
    qVec[0] * uv[1] - qVec[1] * uv[0]
  ] satisfies Vec3;
  return vecAdd(vec, vecAdd(vecScale(uv, 2 * w), vecScale(uuv, 2)));
}

function applyTransform(transform: Transform, point: Vec3): Vec3 {
  return vecAdd(rotateVecByQuat(point, transform.rotation_quat_xyzw), transform.translation_mm);
}

function multiplyTransforms(a: Transform, b: Transform): Transform {
  return {
    translation_mm: vecAdd(a.translation_mm, rotateVecByQuat(b.translation_mm, a.rotation_quat_xyzw)),
    rotation_quat_xyzw: normalizeQuat(quatMultiply(a.rotation_quat_xyzw, b.rotation_quat_xyzw))
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function loadMuseumDataset(baseUrl: string): Promise<{
  raw: MuseumRawDataset;
  constraints: ConstraintsDataset;
  paths: DatasetPaths;
}> {
  const paths: DatasetPaths = {
    raw: `${baseUrl}museum_raw.json`,
    constraints: `${baseUrl}museum_constraints.json`
  };
  const [raw, constraints] = await Promise.all([
    fetchJson<MuseumRawDataset>(paths.raw),
    fetchJson<ConstraintsDataset>(paths.constraints)
  ]);
  return { raw, constraints, paths };
}

export function computeAlignmentFromAnchors(anchors: MuseumAnchor[]): Transform {
  if (anchors.length < 3) {
    throw new Error("At least three anchors are required for SE(3) alignment.");
  }

  // Units are in millimeters. We estimate T_model_scan so that:
  // model_point_mm ≈ T_model_scan * scan_point_mm
  // This maps scan-frame coordinates into the model/world frame.
  const modelCentroid = anchors
    .map((anchor) => anchor.model_mm)
    .reduce<Vec3>((acc, value) => vecAdd(acc, value), [0, 0, 0]);
  const scanCentroid = anchors
    .map((anchor) => anchor.scan_mm)
    .reduce<Vec3>((acc, value) => vecAdd(acc, value), [0, 0, 0]);

  const modelCenter = vecScale(modelCentroid, 1 / anchors.length);
  const scanCenter = vecScale(scanCentroid, 1 / anchors.length);

  const H = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  anchors.forEach((anchor) => {
    const a = vecSub(anchor.scan_mm, scanCenter);
    const b = vecSub(anchor.model_mm, modelCenter);
    H[0][0] += a[0] * b[0];
    H[0][1] += a[0] * b[1];
    H[0][2] += a[0] * b[2];
    H[1][0] += a[1] * b[0];
    H[1][1] += a[1] * b[1];
    H[1][2] += a[1] * b[2];
    H[2][0] += a[2] * b[0];
    H[2][1] += a[2] * b[1];
    H[2][2] += a[2] * b[2];
  });

  const Sxx = H[0][0];
  const Sxy = H[0][1];
  const Sxz = H[0][2];
  const Syx = H[1][0];
  const Syy = H[1][1];
  const Syz = H[1][2];
  const Szx = H[2][0];
  const Szy = H[2][1];
  const Szz = H[2][2];

  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]
  ];

  let v = [1, 0, 0, 0];
  for (let iter = 0; iter < 24; iter += 1) {
    const next = [
      N[0][0] * v[0] + N[0][1] * v[1] + N[0][2] * v[2] + N[0][3] * v[3],
      N[1][0] * v[0] + N[1][1] * v[1] + N[1][2] * v[2] + N[1][3] * v[3],
      N[2][0] * v[0] + N[2][1] * v[1] + N[2][2] * v[2] + N[2][3] * v[3],
      N[3][0] * v[0] + N[3][1] * v[1] + N[3][2] * v[2] + N[3][3] * v[3]
    ];
    const norm = Math.hypot(next[0], next[1], next[2], next[3]);
    if (norm === 0) break;
    v = [next[0] / norm, next[1] / norm, next[2] / norm, next[3] / norm];
  }

  const quatWxyz = v;
  const rotation: Quat = normalizeQuat([quatWxyz[1], quatWxyz[2], quatWxyz[3], quatWxyz[0]]);
  const rotatedScanCenter = rotateVecByQuat(scanCenter, rotation);
  const translation = vecSub(modelCenter, rotatedScanCenter);

  return { translation_mm: translation, rotation_quat_xyzw: rotation };
}

export function computeResidualsMm(
  anchors: MuseumAnchor[],
  alignment: Transform
): { residuals: AnchorResidual[]; rms_mm: number } {
  const residuals = anchors.map((anchor) => {
    const predicted = applyTransform(alignment, anchor.scan_mm);
    const residual = vecSub(anchor.model_mm, predicted);
    return {
      anchor_id: anchor.anchor_id,
      residual_mm_vec: residual,
      residual_norm_mm: vecNorm(residual)
    };
  });

  const sumSquares = residuals.reduce((sum, item) => sum + item.residual_norm_mm ** 2, 0);
  const rms_mm = residuals.length === 0 ? 0 : Math.sqrt(sumSquares / residuals.length);

  return { residuals, rms_mm };
}

export function convertMuseumRawToPoseDatasets(
  raw: MuseumRawDataset,
  alignment: Transform
): { nominal: NominalPosesDataset; asBuilt: AsBuiltPosesDataset } {
  const nominal: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: raw.parts.map((part) => ({
      part_id: part.part_id,
      part_name: part.part_name,
      part_type: part.part_type,
      T_world_part_nominal: part.T_model_part_nominal
    }))
  };

  // Assumption: raw as-built poses are reported in the scan frame.
  // Apply T_model_scan to express them in the model/world frame before directives.
  const asBuilt: AsBuiltPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: raw.measured_at,
    parts: raw.parts.map((part) => ({
      part_id: part.part_id,
      T_world_part_asBuilt: multiplyTransforms(alignment, part.T_scan_part_asBuilt),
      pose_confidence: part.pose_confidence,
      confidence_notes: part.confidence_notes
    }))
  };

  return { nominal, asBuilt };
}
