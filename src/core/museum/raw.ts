import type { AnchorPoint } from "../align/rigid.js";

export type Vec3 = [number, number, number];

export interface MuseumLine {
  p0: Vec3;
  p1: Vec3;
}

export interface MuseumAnchor {
  anchor_id: string;
  model_xyz_mm: Vec3;
  scan_xyz_mm: Vec3;
}

export interface MuseumPart {
  part_id: string;
  nominal_line_mm: MuseumLine;
  scan_line_mm: MuseumLine;
  pose_confidence?: number;
}

export interface MuseumRawDataset {
  schema_version?: string;
  dataset_id: string;
  anchors: MuseumAnchor[];
  parts: MuseumPart[];
}

export interface AnchorPointPairs {
  scanPts: AnchorPoint[];
  modelPts: AnchorPoint[];
}

export function anchorsToPointPairs(raw: MuseumRawDataset): AnchorPointPairs {
  const anchors = raw.anchors;

  if (!anchors || anchors.length === 0) {
    throw new Error("MuseumRawDataset must contain at least one anchor.");
  }

  for (const anchor of anchors) {
    if (!anchor.scan_xyz_mm || !anchor.model_xyz_mm) {
      throw new Error(
        `Anchor ${anchor.anchor_id} is missing scan_xyz_mm or model_xyz_mm.`
      );
    }
  }

  const sorted = [...anchors].sort((a, b) =>
    a.anchor_id.localeCompare(b.anchor_id)
  );

  const scanPts: AnchorPoint[] = sorted.map((anchor) => ({
    anchor_id: anchor.anchor_id,
    point_mm: anchor.scan_xyz_mm,
  }));

  const modelPts: AnchorPoint[] = sorted.map((anchor) => ({
    anchor_id: anchor.anchor_id,
    point_mm: anchor.model_xyz_mm,
  }));

  return { scanPts, modelPts };
}
