import { applyTransformToLine, applyTransformToPoint } from "../src/core/index.js";
import type { Line3 } from "../src/core/align/apply.js";
import { normalizeMuseumAnchors as normalizeMuseumAnchorsCore } from "../src/core/convert/museumAnchors.js";
import type {
  MuseumAnchor,
  MuseumLine,
  MuseumRawDataset,
  MuseumRawPart
} from "../src/core/convert/museumAnchors.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../src/types.js";

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

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vec: Vec3, scalar: number): Vec3 {
  return [vec[0] * scalar, vec[1] * scalar, vec[2] * scalar];
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}

function toLine3(line: MuseumLine): Line3 {
  return { start_mm: line.p0, end_mm: line.p1 };
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

function getAsBuiltTranslation(part: MuseumRawPart, T_model_scan: Transform): Vec3 {
  if (part.scan_line_mm) {
    const transformed = applyTransformToLine(T_model_scan, toLine3(part.scan_line_mm));
    return midpoint(transformed.start_mm, transformed.end_mm);
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
  return applyTransformToPoint(T_model_scan, scanFallback.translation_mm);
}

export const normalizeMuseumAnchors = normalizeMuseumAnchorsCore;

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

  const T_model_scan = alignment;
  const asBuilt = {
    schema_version: "v0.1",
    dataset_id: raw.dataset_id,
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: requireMeasuredAt(raw.measured_at),
    parts: asBuiltParts.map((part) => {
      const midpoint = getAsBuiltTranslation(part, T_model_scan);
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
