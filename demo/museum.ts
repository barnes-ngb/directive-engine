import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../src/types.js";

export type MuseumAnchor = {
  id: string;
  model_mm: Vec3;
  scan_mm: Vec3;
};

type MuseumAnchorRaw = {
  id?: string;
  anchor_id?: string;
  model_mm?: Vec3;
  scan_mm?: Vec3;
  model_xyz_mm?: Vec3;
  scan_xyz_mm?: Vec3;
  model?: Vec3;
  scan?: Vec3;
};

type MuseumRawPart = {
  part_id: string;
  part_name?: string;
  part_type?: string;
  nominal_line_mm?: MuseumLine;
  scan_line_mm?: MuseumLine;
  pose_confidence?: number;
  confidence_notes?: string;
  T_model_part_nominal?: Transform;
  T_world_part_nominal?: Transform;
  T_model_part?: Transform;
  T_world_part?: Transform;
  T_scan_part_asBuilt?: Transform;
  T_scan_part?: Transform;
  T_world_part_asBuilt?: Transform;
  pose?: Transform;
};

export type MuseumRawDataset = {
  dataset_id: string;
  measured_at?: string;
  anchors: MuseumAnchorRaw[];
  parts?: MuseumRawPart[];
  nominal_parts?: MuseumRawPart[];
  as_built_parts?: MuseumRawPart[];
  nominal_poses?: { parts: MuseumRawPart[] };
  as_built_poses?: { parts: MuseumRawPart[] };
};

export type AlignmentResidual = {
  id: string;
  magnitude: number;
  translation: Vec3;
};

export type AlignmentQuality = {
  rms: number | null;
  residuals: AlignmentResidual[];
};

type MuseumLine = {
  p0: Vec3;
  p1: Vec3;
};

type FetchFailureKind = "http" | "parse" | "network";

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
  raw: MuseumRawDataset;
  constraints: ConstraintsDataset;
}> {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const museumRawPath = `${baseUrl}museum_raw.json`;
  const museumConstraintsPath = `${baseUrl}museum_constraints.json`;
  const [raw, constraints] = await Promise.all([
    fetchJsonWithDiagnostics<MuseumRawDataset>(museumRawPath),
    fetchJsonWithDiagnostics<ConstraintsDataset>(museumConstraintsPath)
  ]);
  return { raw, constraints };
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function isMuseumLine(value: unknown): value is MuseumLine {
  return (
    !!value &&
    typeof value === "object" &&
    isVec3((value as MuseumLine).p0) &&
    isVec3((value as MuseumLine).p1)
  );
}

function requireVec3(value: unknown, label: string): Vec3 {
  if (!isVec3(value)) {
    throw new Error(`Museum anchor ${label} is not a valid Vec3.`);
  }
  return value;
}

function requireLineMidpoint(value: unknown, label: string): Vec3 {
  if (!isMuseumLine(value)) {
    throw new Error(`Museum line ${label} is not a valid line.`);
  }
  return midpoint(value.p0, value.p1);
}

function requireMeasuredAt(value: string | undefined): string {
  if (!value) {
    throw new Error("Museum dataset measured_at is required for v0.1 datasets.");
  }
  return value;
}

function normalizeAnchors(rawAnchors: MuseumAnchorRaw[]): MuseumAnchor[] {
  return rawAnchors.map((anchor, index) => {
    const id = anchor.id ?? anchor.anchor_id ?? `anchor-${index + 1}`;
    const model = anchor.model_mm ?? anchor.model_xyz_mm ?? anchor.model;
    const scan = anchor.scan_mm ?? anchor.scan_xyz_mm ?? anchor.scan;
    return {
      id,
      model_mm: requireVec3(model, `${id} model_mm`),
      scan_mm: requireVec3(scan, `${id} scan_mm`)
    };
  });
}

function centroid(points: Vec3[]): Vec3 {
  const count = points.length;
  const sum = points.reduce(
    (acc, vec) => [acc[0] + vec[0], acc[1] + vec[1], acc[2] + vec[2]] as Vec3,
    [0, 0, 0]
  );
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vec: Vec3, scalar: number): Vec3 {
  return [vec[0] * scalar, vec[1] * scalar, vec[2] * scalar];
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}

function multiplyMatrixVector(matrix: number[][], vec: Vec3): Vec3 {
  return [
    matrix[0][0] * vec[0] + matrix[0][1] * vec[1] + matrix[0][2] * vec[2],
    matrix[1][0] * vec[0] + matrix[1][1] * vec[1] + matrix[1][2] * vec[2],
    matrix[2][0] * vec[0] + matrix[2][1] * vec[1] + matrix[2][2] * vec[2]
  ];
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2]
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2]
    ]
  ];
}

function transpose(matrix: number[][]): number[][] {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]]
  ];
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vec;
  return vec.map((value) => value / norm);
}

function powerIteration(matrix: number[][], iterations = 50): number[] {
  let vec = [1, 0, 0, 0];
  for (let i = 0; i < iterations; i += 1) {
    const next = [
      matrix[0][0] * vec[0] + matrix[0][1] * vec[1] + matrix[0][2] * vec[2] + matrix[0][3] * vec[3],
      matrix[1][0] * vec[0] + matrix[1][1] * vec[1] + matrix[1][2] * vec[2] + matrix[1][3] * vec[3],
      matrix[2][0] * vec[0] + matrix[2][1] * vec[1] + matrix[2][2] * vec[2] + matrix[2][3] * vec[3],
      matrix[3][0] * vec[0] + matrix[3][1] * vec[1] + matrix[3][2] * vec[2] + matrix[3][3] * vec[3]
    ];
    vec = normalizeVector(next);
  }
  return vec;
}

function quatFromRotationMatrix(matrix: number[][]): Quat {
  const m00 = matrix[0][0];
  const m11 = matrix[1][1];
  const m22 = matrix[2][2];
  const trace = m00 + m11 + m22;

  let x = 0;
  let y = 0;
  let z = 0;
  let w = 1;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    w = 0.25 * s;
    x = (matrix[2][1] - matrix[1][2]) / s;
    y = (matrix[0][2] - matrix[2][0]) / s;
    z = (matrix[1][0] - matrix[0][1]) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (matrix[2][1] - matrix[1][2]) / s;
    x = 0.25 * s;
    y = (matrix[0][1] + matrix[1][0]) / s;
    z = (matrix[0][2] + matrix[2][0]) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (matrix[0][2] - matrix[2][0]) / s;
    x = (matrix[0][1] + matrix[1][0]) / s;
    y = 0.25 * s;
    z = (matrix[1][2] + matrix[2][1]) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (matrix[1][0] - matrix[0][1]) / s;
    x = (matrix[0][2] + matrix[2][0]) / s;
    y = (matrix[1][2] + matrix[2][1]) / s;
    z = 0.25 * s;
  }

  return [x, y, z, w];
}

function rotationMatrixFromQuat(quat: Quat): number[][] {
  const [x, y, z, w] = quat;
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

function rotationFromCovariance(cov: number[][]): number[][] {
  const sxx = cov[0][0];
  const sxy = cov[0][1];
  const sxz = cov[0][2];
  const syx = cov[1][0];
  const syy = cov[1][1];
  const syz = cov[1][2];
  const szx = cov[2][0];
  const szy = cov[2][1];
  const szz = cov[2][2];

  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]
  ];

  const eigenvector = powerIteration(n);
  const [w, x, y, z] = eigenvector;
  return rotationMatrixFromQuat([x, y, z, w]);
}

// Computes the SE(3) transform T_model_scan that best maps model-frame anchor points
// to scan-frame anchor points. All coordinates are assumed to be in millimeters.
export function computeAlignmentFromAnchors(anchors: MuseumAnchor[]): Transform {
  if (anchors.length < 3) {
    throw new Error("At least three anchor correspondences are required for alignment.");
  }

  const modelPoints = anchors.map((anchor) => anchor.model_mm);
  const scanPoints = anchors.map((anchor) => anchor.scan_mm);
  const modelCentroid = centroid(modelPoints);
  const scanCentroid = centroid(scanPoints);

  let covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < anchors.length; i += 1) {
    const modelOffset = subtract(modelPoints[i], modelCentroid);
    const scanOffset = subtract(scanPoints[i], scanCentroid);
    covariance = [
      [
        covariance[0][0] + modelOffset[0] * scanOffset[0],
        covariance[0][1] + modelOffset[0] * scanOffset[1],
        covariance[0][2] + modelOffset[0] * scanOffset[2]
      ],
      [
        covariance[1][0] + modelOffset[1] * scanOffset[0],
        covariance[1][1] + modelOffset[1] * scanOffset[1],
        covariance[1][2] + modelOffset[1] * scanOffset[2]
      ],
      [
        covariance[2][0] + modelOffset[2] * scanOffset[0],
        covariance[2][1] + modelOffset[2] * scanOffset[1],
        covariance[2][2] + modelOffset[2] * scanOffset[2]
      ]
    ];
  }

  const rotation = rotationFromCovariance(covariance);
  const rotatedCentroid = multiplyMatrixVector(rotation, modelCentroid);
  const translation = subtract(scanCentroid, rotatedCentroid);

  return {
    translation_mm: translation,
    rotation_quat_xyzw: quatFromRotationMatrix(rotation)
  };
}

export function computeResidualsMm(
  anchors: MuseumAnchor[],
  alignment: Transform
): AlignmentQuality {
  if (anchors.length === 0) {
    return { rms: null, residuals: [] };
  }

  const rotation = rotationMatrixFromQuat(alignment.rotation_quat_xyzw);
  const translation = alignment.translation_mm;
  const residuals = anchors.map((anchor) => {
    const predicted = add(multiplyMatrixVector(rotation, anchor.model_mm), translation);
    const residual = subtract(anchor.scan_mm, predicted);
    const magnitude = Math.sqrt(
      residual[0] * residual[0] + residual[1] * residual[1] + residual[2] * residual[2]
    );
    return {
      id: anchor.id,
      magnitude,
      translation: residual
    };
  });

  const rms = Math.sqrt(residuals.reduce((acc, entry) => acc + entry.magnitude ** 2, 0) / residuals.length);
  // Sort by magnitude descending so the largest residuals appear first in the table.
  residuals.sort((a, b) => b.magnitude - a.magnitude);
  return { rms, residuals };
}

function selectParts<T extends { part_id: string }>(
  raw: MuseumRawDataset,
  key: "nominal_parts" | "as_built_parts",
  nestedKey: "nominal_poses" | "as_built_poses"
): T[] {
  if (raw[key]) return raw[key] as T[];
  const nested = raw[nestedKey];
  if (nested?.parts) return nested.parts as T[];
  return [];
}

function pickTransformOptional(source: Record<string, unknown>, keys: string[]): Transform | undefined {
  for (const key of keys) {
    const candidate = source[key];
    if (candidate && typeof candidate === "object") {
      const transform = candidate as Transform;
      if (isVec3(transform.translation_mm) && Array.isArray(transform.rotation_quat_xyzw)) {
        return transform;
      }
    }
  }
  return undefined;
}

function pickTransform(source: Record<string, unknown>, keys: string[], label: string): Transform {
  const transform = pickTransformOptional(source, keys);
  if (!transform) {
    throw new Error(`Missing transform for ${label}.`);
  }
  return transform;
}

function invertTransform(transform: Transform): Transform {
  const rotation = rotationMatrixFromQuat(transform.rotation_quat_xyzw);
  const rotationT = transpose(rotation);
  const translation = scale(multiplyMatrixVector(rotationT, transform.translation_mm), -1);
  return {
    translation_mm: translation,
    rotation_quat_xyzw: quatFromRotationMatrix(rotationT)
  };
}

function composeTransforms(lhs: Transform, rhs: Transform): Transform {
  const rotationL = rotationMatrixFromQuat(lhs.rotation_quat_xyzw);
  const rotationR = rotationMatrixFromQuat(rhs.rotation_quat_xyzw);
  const rotation = multiplyMatrices(rotationL, rotationR);
  const translation = add(multiplyMatrixVector(rotationL, rhs.translation_mm), lhs.translation_mm);
  return {
    translation_mm: translation,
    rotation_quat_xyzw: quatFromRotationMatrix(rotation)
  };
}

function transformPoint(transform: Transform, point: Vec3): Vec3 {
  const rotation = rotationMatrixFromQuat(transform.rotation_quat_xyzw);
  return add(multiplyMatrixVector(rotation, point), transform.translation_mm);
}

function getNominalTranslation(part: MuseumRawPart): Vec3 {
  if (part.nominal_line_mm) {
    return requireLineMidpoint(part.nominal_line_mm, `nominal part ${part.part_id} nominal_line_mm`);
  }
  const fallback = pickTransform(
    part as Record<string, unknown>,
    ["T_world_part_nominal", "T_world_part", "T_model_part_nominal", "T_model_part", "pose"],
    `nominal part ${part.part_id}`
  );
  return fallback.translation_mm;
}

function getAsBuiltTranslation(part: MuseumRawPart, scanToModel: Transform): Vec3 {
  if (part.scan_line_mm) {
    const p0Model = transformPoint(scanToModel, part.scan_line_mm.p0);
    const p1Model = transformPoint(scanToModel, part.scan_line_mm.p1);
    return midpoint(p0Model, p1Model);
  }
  const worldFallback = pickTransformOptional(part as Record<string, unknown>, [
    "T_world_part_asBuilt",
    "T_world_part"
  ]);
  if (worldFallback) {
    return worldFallback.translation_mm;
  }
  const scanFallback = pickTransform(
    part as Record<string, unknown>,
    ["T_scan_part_asBuilt", "T_scan_part", "pose"],
    `as-built part ${part.part_id}`
  );
  return transformPoint(scanToModel, scanFallback.translation_mm);
}

export function normalizeMuseumAnchors(raw: MuseumRawDataset): MuseumAnchor[] {
  return normalizeAnchors(raw.anchors ?? []);
}

export function convertMuseumRawToPoseDatasets(
  raw: MuseumRawDataset,
  alignment: Transform
): { nominal: NominalPosesDataset; asBuilt: AsBuiltPosesDataset; anchors: MuseumAnchor[] } {
  const anchors = normalizeMuseumAnchors(raw);
  const mergedParts = raw.parts;
  const nominalParts = mergedParts ?? selectParts<MuseumRawPart>(raw, "nominal_parts", "nominal_poses");
  const asBuiltParts = mergedParts ?? selectParts<MuseumRawPart>(raw, "as_built_parts", "as_built_poses");
  const identityQuat: Quat = [0, 0, 0, 1];

  const nominal = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: nominalParts.map((part) => {
      const midpoint = getNominalTranslation(part);
      const transform: Transform = {
        translation_mm: midpoint,
        rotation_quat_xyzw: identityQuat
      };
      return {
        part_id: part.part_id,
        part_name: part.part_name ?? part.part_id,
        part_type: part.part_type ?? "unknown",
        T_world_part_nominal: transform
      };
    })
  } satisfies NominalPosesDataset;

  const scanToModel = invertTransform(alignment);
  const asBuilt = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: requireMeasuredAt(raw.measured_at),
    parts: asBuiltParts.map((part) => {
      const midpoint = getAsBuiltTranslation(part, scanToModel);
      const transformed: Transform = {
        translation_mm: midpoint,
        rotation_quat_xyzw: identityQuat
      };
      return {
        part_id: part.part_id,
        T_world_part_asBuilt: transformed,
        pose_confidence: part.pose_confidence ?? 1,
        confidence_notes: part.confidence_notes
      };
    })
  } satisfies AsBuiltPosesDataset;

  return { nominal, asBuilt, anchors };
}
