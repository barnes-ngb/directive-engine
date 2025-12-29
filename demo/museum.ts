import { applyTransformToPoint, computeRigidTransform, invertTransform } from "../src/core/index.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../src/core/index.js";

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

// Computes the SE(3) transform T_model_scan that best maps model-frame anchor points
// to scan-frame anchor points. All coordinates are assumed to be in millimeters.
export function computeAlignmentFromAnchors(anchors: MuseumAnchor[]): Transform {
  const scanPts = anchors.map((anchor) => ({
    anchor_id: anchor.id,
    point_mm: anchor.scan_mm
  }));
  const modelPts = anchors.map((anchor) => ({
    anchor_id: anchor.id,
    point_mm: anchor.model_mm
  }));
  const { T_model_scan } = computeRigidTransform(scanPts, modelPts);
  return T_model_scan;
}

export function computeResidualsMm(
  anchors: MuseumAnchor[],
  alignment: Transform
): AlignmentQuality {
  if (anchors.length === 0) {
    return { rms: null, residuals: [] };
  }

  const residuals = anchors.map((anchor) => {
    const predicted = applyTransformToPoint(alignment, anchor.model_mm);
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
    const p0Model = applyTransformToPoint(scanToModel, part.scan_line_mm.p0);
    const p1Model = applyTransformToPoint(scanToModel, part.scan_line_mm.p1);
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
  return applyTransformToPoint(scanToModel, scanFallback.translation_mm);
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
