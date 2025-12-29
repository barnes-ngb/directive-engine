import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../src/types.js";

type FetchFailureKind = "http" | "parse" | "network";

export type MuseumAnchor = {
  anchor_id: string;
  model_xyz_mm: Vec3;
  scan_xyz_mm: Vec3;
};

export type MuseumRawPose = {
  part_id: string;
  part_name?: string;
  part_type?: string;
  translation_mm: Vec3;
  rotation_quat_xyzw: Quat;
  pose_confidence?: number;
  confidence_notes?: string;
};

export type MuseumRawPayload = {
  dataset_id?: string;
  anchors: MuseumAnchor[];
  nominal_parts?: MuseumRawPose[];
  nominal_poses?: MuseumRawPose[];
  as_built_parts?: MuseumRawPose[];
  as_built_poses?: MuseumRawPose[];
  measured_at?: string;
  as_built_frame?: "scan" | "model";
};

export class DatasetFetchError extends Error {
  readonly kind: FetchFailureKind;
  readonly path: string;
  readonly status?: number;
  readonly statusText?: string;

  constructor(
    kind: FetchFailureKind,
    path: string,
    status?: number,
    statusText?: string,
    message?: string
  ) {
    super(message ?? `Failed to load ${path}`);
    this.kind = kind;
    this.path = path;
    this.status = status;
    this.statusText = statusText;
  }
}

function getRawNominalPoses(raw: MuseumRawPayload): MuseumRawPose[] {
  return raw.nominal_parts ?? raw.nominal_poses ?? [];
}

function getRawAsBuiltPoses(raw: MuseumRawPayload): MuseumRawPose[] {
  return raw.as_built_parts ?? raw.as_built_poses ?? [];
}

function assertNonEmpty<T>(items: T[], label: string): T[] {
  if (items.length === 0) {
    throw new Error(`Museum raw data is missing ${label}.`);
  }
  return items;
}

async function fetchJsonWithDiagnostics<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw new DatasetFetchError("network", path, undefined, undefined, String(error));
  }

  if (!response.ok) {
    throw new DatasetFetchError("http", path, response.status, response.statusText);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new DatasetFetchError("parse", path, response.status, response.statusText, String(error));
  }
}

export async function loadMuseumDataset(): Promise<{
  raw: MuseumRawPayload;
  constraints: ConstraintsDataset;
}> {
  const museumRawPath = "/museum_raw.json";
  const museumConstraintsPath = "/museum_constraints.json";
  const [raw, constraints] = await Promise.all([
    fetchJsonWithDiagnostics<MuseumRawPayload>(museumRawPath),
    fetchJsonWithDiagnostics<ConstraintsDataset>(museumConstraintsPath)
  ]);

  return { raw, constraints };
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dotVec(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normSquared(a: Vec3): number {
  return dotVec(a, a);
}

function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  const x = aw * bx + bw * ax + ay * bz - az * by;
  const y = aw * by + bw * ay + az * bx - ax * bz;
  const z = aw * bz + bw * az + ax * by - ay * bx;
  const w = aw * bw - ax * bx - ay * by - az * bz;
  return quatNormalize([x, y, z, w]);
}

function quatToMatrix(q: Quat): number[][] {
  const [x, y, z, w] = quatNormalize(q);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]
  ];
}

function applyRotation(matrix: number[][], vec: Vec3): Vec3 {
  return [
    matrix[0][0] * vec[0] + matrix[0][1] * vec[1] + matrix[0][2] * vec[2],
    matrix[1][0] * vec[0] + matrix[1][1] * vec[1] + matrix[1][2] * vec[2],
    matrix[2][0] * vec[0] + matrix[2][1] * vec[1] + matrix[2][2] * vec[2]
  ];
}

function applyTransform(transform: Transform, point: Vec3): Vec3 {
  const rotation = quatToMatrix(transform.rotation_quat_xyzw);
  return addVec(applyRotation(rotation, point), transform.translation_mm);
}

function composeTransforms(a: Transform, b: Transform): Transform {
  const rotation = quatMultiply(a.rotation_quat_xyzw, b.rotation_quat_xyzw);
  const rotatedTranslation = applyRotation(
    quatToMatrix(a.rotation_quat_xyzw),
    b.translation_mm
  );
  return {
    translation_mm: addVec(a.translation_mm, rotatedTranslation),
    rotation_quat_xyzw: rotation
  };
}

function buildHornMatrix(cov: number[][]): number[][] {
  const sxx = cov[0][0];
  const sxy = cov[0][1];
  const sxz = cov[0][2];
  const syx = cov[1][0];
  const syy = cov[1][1];
  const syz = cov[1][2];
  const szx = cov[2][0];
  const szy = cov[2][1];
  const szz = cov[2][2];

  const trace = sxx + syy + szz;

  return [
    [trace, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, idx) => sum + value * vector[idx], 0));
}

function normalizeVector(vector: number[]): number[] {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function dominantEigenvector(matrix: number[][], iterations = 24): number[] {
  let vector = [1, 0, 0, 0];
  for (let i = 0; i < iterations; i += 1) {
    vector = normalizeVector(multiplyMatrixVector(matrix, vector));
  }
  return vector;
}

function computeCentroid(points: Vec3[]): Vec3 {
  const count = points.length;
  const sum = points.reduce((acc, point) => addVec(acc, point), [0, 0, 0]);
  return scaleVec(sum, 1 / count);
}

function computeCovariance(scanPoints: Vec3[], modelPoints: Vec3[]): number[][] {
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < scanPoints.length; i += 1) {
    const s = scanPoints[i];
    const m = modelPoints[i];
    cov[0][0] += s[0] * m[0];
    cov[0][1] += s[0] * m[1];
    cov[0][2] += s[0] * m[2];
    cov[1][0] += s[1] * m[0];
    cov[1][1] += s[1] * m[1];
    cov[1][2] += s[1] * m[2];
    cov[2][0] += s[2] * m[0];
    cov[2][1] += s[2] * m[1];
    cov[2][2] += s[2] * m[2];
  }

  return cov;
}

export function computeAlignmentFromAnchors(anchors: MuseumAnchor[]): Transform {
  // The anchors are expected in millimeters (mm).
  // This computes T_model_scan such that: p_model = R * p_scan + t.
  if (anchors.length < 3) {
    throw new Error("Museum alignment requires at least three anchor correspondences.");
  }

  const modelPoints = anchors.map((anchor) => anchor.model_xyz_mm);
  const scanPoints = anchors.map((anchor) => anchor.scan_xyz_mm);

  const modelCentroid = computeCentroid(modelPoints);
  const scanCentroid = computeCentroid(scanPoints);

  const centeredModel = modelPoints.map((point) => subVec(point, modelCentroid));
  const centeredScan = scanPoints.map((point) => subVec(point, scanCentroid));

  const covariance = computeCovariance(centeredScan, centeredModel);
  const hornMatrix = buildHornMatrix(covariance);
  const eigenvector = dominantEigenvector(hornMatrix);
  const [qw, qx, qy, qz] = eigenvector;
  const rotationQuat: Quat = quatNormalize([qx, qy, qz, qw]);

  const rotatedScanCentroid = applyRotation(quatToMatrix(rotationQuat), scanCentroid);
  const translation = subVec(modelCentroid, rotatedScanCentroid);

  return {
    translation_mm: translation,
    rotation_quat_xyzw: rotationQuat
  };
}

export function computeResidualsMm(
  anchors: MuseumAnchor[],
  T_model_scan: Transform
): { per_anchor_mm: { anchor_id: string; residual_mm: Vec3 }[]; rms_mm: number } {
  const residuals = anchors.map((anchor) => {
    const transformed = applyTransform(T_model_scan, anchor.scan_xyz_mm);
    return {
      anchor_id: anchor.anchor_id,
      residual_mm: subVec(transformed, anchor.model_xyz_mm)
    };
  });

  const meanSquared =
    residuals.reduce((sum, residual) => sum + normSquared(residual.residual_mm), 0) /
    residuals.length;
  const rms = Math.sqrt(meanSquared);

  return { per_anchor_mm: residuals, rms_mm: rms };
}

export function convertMuseumRawToPoseDatasets(
  raw: MuseumRawPayload,
  options?: { alignment?: Transform }
): { nominal: NominalPosesDataset; asBuilt: AsBuiltPosesDataset } {
  const anchors = assertNonEmpty(raw.anchors ?? [], "anchor correspondences");
  const nominalParts = assertNonEmpty(getRawNominalPoses(raw), "nominal poses");
  const asBuiltParts = assertNonEmpty(getRawAsBuiltPoses(raw), "as-built poses");

  const alignment = options?.alignment ?? computeAlignmentFromAnchors(anchors);
  const asBuiltFrame = raw.as_built_frame ?? "scan";

  const nominal: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id ?? "museum",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: nominalParts.map((part) => ({
      part_id: part.part_id,
      part_name: part.part_name ?? part.part_id,
      part_type: part.part_type ?? "unknown",
      T_world_part_nominal: {
        translation_mm: part.translation_mm,
        rotation_quat_xyzw: part.rotation_quat_xyzw
      }
    }))
  };

  // Assumption: raw as-built poses are expressed in scan frame unless specified otherwise.
  // Apply T_model_scan to bring them into the model/world frame used by directives.
  const asBuilt: AsBuiltPosesDataset = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id ?? "museum",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: raw.measured_at ?? new Date().toISOString(),
    parts: asBuiltParts.map((part) => {
      const rawTransform: Transform = {
        translation_mm: part.translation_mm,
        rotation_quat_xyzw: part.rotation_quat_xyzw
      };
      const worldTransform =
        asBuiltFrame === "model" ? rawTransform : composeTransforms(alignment, rawTransform);
      return {
        part_id: part.part_id,
        T_world_part_asBuilt: worldTransform,
        pose_confidence: part.pose_confidence ?? 1,
        confidence_notes: part.confidence_notes
      };
    })
  };

  return { nominal, asBuilt };
}
