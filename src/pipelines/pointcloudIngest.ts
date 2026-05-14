/**
 * Point-cloud ingest: ASCII PLY / XYZ → ScanPoint[] → AsBuiltPosesDataset.
 *
 * Thin IO layer over the existing scan math (segment → fitLinePCA →
 * poseFromLineFit). The CLI and tests both call `runIngest` so disk IO
 * stays out of the unit tests.
 *
 * Binary PLY, E57, PCD, and LAS are out of scope for v0.2.1.
 */

import type {
  AsBuiltPartPose,
  AsBuiltPosesDataset,
  Transform,
  Vec3,
} from "../core/types.js";
import type { ScanPoint } from "../core/scan/index.js";
import {
  fitLinePCA,
  poseFromLineFit,
  segmentPointsNearLine,
} from "../core/scan/index.js";
import { applyTransformToPoint } from "../core/align/apply.js";
import {
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
} from "./poseFromScan.js";

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parsePlyAscii(text: string): ScanPoint[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "ply") {
    throw new Error("malformed PLY: missing 'ply' magic on first line");
  }

  let format: string | null = null;
  let vertexCount: number | null = null;
  const vertexProps: string[] = [];
  let inElementVertex = false;
  let headerEndIdx = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (line.startsWith("comment")) continue;

    if (line.startsWith("format ")) {
      format = line.slice("format ".length).trim();
      continue;
    }

    if (line.startsWith("element ")) {
      const parts = line.split(/\s+/);
      if (parts[1] === "vertex") {
        inElementVertex = true;
        const n = Number(parts[2]);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`malformed PLY: invalid vertex count '${parts[2]}'`);
        }
        vertexCount = n;
      } else {
        inElementVertex = false;
      }
      continue;
    }

    if (line.startsWith("property ") && inElementVertex) {
      const parts = line.split(/\s+/);
      vertexProps.push(parts[parts.length - 1]);
      continue;
    }

    if (line === "end_header") {
      headerEndIdx = i;
      break;
    }
  }

  if (headerEndIdx < 0) {
    throw new Error("malformed PLY: missing 'end_header'");
  }
  if (format === null) {
    throw new Error("malformed PLY: missing 'format' line in header");
  }
  if (format.startsWith("binary")) {
    throw new Error("binary PLY not yet supported (ASCII only)");
  }
  if (!format.startsWith("ascii")) {
    throw new Error(`malformed PLY: unsupported format '${format}'`);
  }
  if (vertexCount === null) {
    throw new Error("malformed PLY: missing 'element vertex' declaration");
  }

  const xIdx = vertexProps.indexOf("x");
  const yIdx = vertexProps.indexOf("y");
  const zIdx = vertexProps.indexOf("z");
  if (xIdx < 0 || yIdx < 0 || zIdx < 0) {
    throw new Error("malformed PLY: vertex element must declare x, y, z");
  }
  const intensityIdx = vertexProps.indexOf("intensity");

  const points: ScanPoint[] = [];
  let read = 0;
  for (let i = headerEndIdx + 1; i < lines.length && read < vertexCount; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < vertexProps.length) {
      throw new Error(
        `malformed PLY: vertex row ${read} has ${tokens.length} fields, expected ${vertexProps.length}`
      );
    }
    const x = Number(tokens[xIdx]);
    const y = Number(tokens[yIdx]);
    const z = Number(tokens[zIdx]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`malformed PLY: non-numeric coordinate at vertex ${read}`);
    }
    const pt: ScanPoint = { point_mm: [x, y, z] };
    if (intensityIdx >= 0) {
      const intensity = Number(tokens[intensityIdx]);
      if (Number.isFinite(intensity)) pt.intensity = intensity;
    }
    points.push(pt);
    read++;
  }

  if (read !== vertexCount) {
    throw new Error(
      `malformed PLY: declared ${vertexCount} vertices but parsed ${read}`
    );
  }

  return points;
}

export function parseXyz(text: string): ScanPoint[] {
  const points: ScanPoint[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const tokens = raw.split(/\s+/);
    if (tokens.length < 3) {
      throw new Error(`malformed XYZ: line ${i + 1} has fewer than 3 fields`);
    }
    const x = Number(tokens[0]);
    const y = Number(tokens[1]);
    const z = Number(tokens[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`malformed XYZ: non-numeric coordinate on line ${i + 1}`);
    }
    const pt: ScanPoint = { point_mm: [x, y, z] };
    if (tokens.length >= 4) {
      const intensity = Number(tokens[3]);
      if (Number.isFinite(intensity)) pt.intensity = intensity;
    }
    points.push(pt);
  }
  return points;
}

export function parsePly(input: string | ArrayBuffer): ScanPoint[] {
  if (input instanceof ArrayBuffer) {
    throw new Error("binary PLY not yet supported (ASCII only)");
  }
  return parsePlyAscii(input);
}

// ---------------------------------------------------------------------------
// Ingest core
// ---------------------------------------------------------------------------

export interface PartLineDef {
  partId: string;
  p0Nominal: Vec3;
  p1Nominal: Vec3;
}

export interface IngestOptions {
  points: ScanPoint[];
  partLines: PartLineDef[];
  T_model_scan?: Transform;
  config?: PipelineConfig;
}

const IDENTITY_TRANSFORM: Transform = {
  translation_mm: [0, 0, 0],
  rotation_quat_xyzw: [0, 0, 0, 1],
};

function runIngest(
  points: ScanPoint[],
  partLines: PartLineDef[],
  T_model_scan: Transform,
  config: PipelineConfig
): AsBuiltPosesDataset {
  // Bring scan points into model frame once (identity is a no-op fast path).
  const isIdentity =
    T_model_scan.translation_mm[0] === 0 &&
    T_model_scan.translation_mm[1] === 0 &&
    T_model_scan.translation_mm[2] === 0 &&
    T_model_scan.rotation_quat_xyzw[0] === 0 &&
    T_model_scan.rotation_quat_xyzw[1] === 0 &&
    T_model_scan.rotation_quat_xyzw[2] === 0 &&
    T_model_scan.rotation_quat_xyzw[3] === 1;

  const modelPoints: ScanPoint[] = isIdentity
    ? points
    : points.map((pt) => ({
        point_mm: applyTransformToPoint(T_model_scan, pt.point_mm),
        ...(pt.intensity !== undefined ? { intensity: pt.intensity } : {}),
      }));

  const parts: AsBuiltPartPose[] = [];

  for (const part of partLines) {
    const seg = segmentPointsNearLine(modelPoints, part.p0Nominal, part.p1Nominal, {
      tubeRadius_mm: config.tube_radius_mm,
      enforceSegmentBounds: true,
    });

    if (seg.inlier_count < 2) {
      parts.push({
        part_id: part.partId,
        T_world_part_asBuilt: IDENTITY_TRANSFORM,
        pose_confidence: 0,
        confidence_notes: `insufficient inliers (${seg.inlier_count}) for line fit`,
      });
      continue;
    }

    const fit = fitLinePCA(seg.inliers);
    const pose = poseFromLineFit(fit);

    parts.push({
      part_id: part.partId,
      T_world_part_asBuilt: pose.T_world_part_asBuilt,
      pose_confidence: pose.pose_confidence,
      confidence_notes: pose.confidence_notes,
    });
  }

  return {
    schema_version: "v0.1",
    dataset_id: "pointcloud_ingest",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: new Date().toISOString(),
    parts,
  };
}

export function ingestPointCloudToPoses(opts: IngestOptions): AsBuiltPosesDataset {
  const T = opts.T_model_scan ?? IDENTITY_TRANSFORM;
  const cfg = opts.config ?? DEFAULT_PIPELINE_CONFIG;
  return runIngest(opts.points, opts.partLines, T, cfg);
}

// Internal helper exposed for tests; not part of the public API surface.
export const __test__ = { runIngest };
