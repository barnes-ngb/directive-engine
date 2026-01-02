import type { Vec3 } from "../types.js";

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

export type MuseumRawDataset = {
  dataset_id: string;
  measured_at?: string;
  anchors: MuseumAnchorRaw[];
};

export type NormalizedMuseumAnchor = {
  id: string;
  model_mm: Vec3 | undefined;
  scan_mm: Vec3 | undefined;
};

export function normalizeMuseumAnchors(raw: MuseumRawDataset): NormalizedMuseumAnchor[] {
  return (raw.anchors ?? []).map((anchor, index) => ({
    id: anchor.id ?? anchor.anchor_id ?? `anchor-${index + 1}`,
    model_mm: anchor.model_mm ?? anchor.model_xyz_mm ?? anchor.model,
    scan_mm: anchor.scan_mm ?? anchor.scan_xyz_mm ?? anchor.scan
  }));
}
