import type { Transform, Vec3 } from "../../types.js";

export type MuseumAnchor = {
  id: string;
  model_mm: Vec3;
  scan_mm: Vec3;
};

export type MuseumAnchorRaw = {
  id?: string;
  anchor_id?: string;
  model_mm?: Vec3;
  scan_mm?: Vec3;
  model_xyz_mm?: Vec3;
  scan_xyz_mm?: Vec3;
  model?: Vec3;
  scan?: Vec3;
};

export type MuseumLine = {
  p0: Vec3;
  p1: Vec3;
};

export type MuseumRawPart = {
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

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function requireVec3(value: unknown, label: string): Vec3 {
  if (!isVec3(value)) {
    throw new Error(`Museum anchor ${label} is not a valid Vec3.`);
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

export function normalizeMuseumAnchors(raw: MuseumRawDataset): MuseumAnchor[] {
  return normalizeAnchors(raw.anchors ?? []);
}
