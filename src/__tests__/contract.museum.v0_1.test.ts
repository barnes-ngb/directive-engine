import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { applyTransformToPoint, computeRigidTransform } from "../core/index.js";
import { generateDirectives } from "../core/generateDirectives.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Transform,
  Vec3
} from "../types.js";

type MuseumAnchorRaw = {
  anchor_id: string;
  model_xyz_mm: Vec3;
  scan_xyz_mm: Vec3;
};

type MuseumLine = {
  p0: Vec3;
  p1: Vec3;
};

type MuseumRawPart = {
  part_id: string;
  part_name?: string;
  part_type?: string;
  nominal_line_mm?: MuseumLine;
  scan_line_mm?: MuseumLine;
  pose_confidence?: number;
  confidence_notes?: string;
};

type MuseumRawDataset = {
  dataset_id: string;
  measured_at?: string;
  anchors: MuseumAnchorRaw[];
  parts?: MuseumRawPart[];
};

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

function sameStringArrayAsSet(a: string[], b: string[]) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  assert.deepEqual(sa, sb);
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

describe("contract v0.1 museum dataset", () => {
  it("generates directives for museum fixtures", async () => {
    const rawPath = "datasets/museum_facade_v0_1/directive_engine_export/museum_raw.json";
    const constraintsPath =
      "datasets/museum_facade_v0_1/directive_engine_export/museum_constraints.json";

    const raw = await readJson<MuseumRawDataset>(rawPath);
    const constraints = await readJson<ConstraintsDataset>(constraintsPath);
    const rawWithMeasuredAt: MuseumRawDataset = {
      ...raw,
      measured_at: raw.measured_at ?? "2025-01-01T00:00:00Z"
    };

    const scanPts = rawWithMeasuredAt.anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      point_mm: anchor.scan_xyz_mm
    }));
    const modelPts = rawWithMeasuredAt.anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      point_mm: anchor.model_xyz_mm
    }));
    const alignment = computeRigidTransform(scanPts, modelPts);
    const identityQuat: Quat = [0, 0, 0, 1];
    const parts = rawWithMeasuredAt.parts ?? [];

    const nominal: NominalPosesDataset = {
      schema_version: "v0.1",
      dataset_id: rawWithMeasuredAt.dataset_id,
      frame_id: "world",
      units: { length: "mm", rotation: "quaternion_xyzw" },
      parts: parts.map((part) => {
        if (!part.nominal_line_mm) {
          throw new Error(`Missing nominal_line_mm for ${part.part_id}.`);
        }
        const translation = midpoint(part.nominal_line_mm.p0, part.nominal_line_mm.p1);
        const transform: Transform = {
          translation_mm: translation,
          rotation_quat_xyzw: identityQuat
        };
        return {
          part_id: part.part_id,
          part_name: part.part_name ?? part.part_id,
          part_type: part.part_type ?? "unknown",
          T_world_part_nominal: transform
        };
      })
    };

    const asBuilt: AsBuiltPosesDataset = {
      schema_version: "v0.1",
      dataset_id: rawWithMeasuredAt.dataset_id,
      frame_id: "world",
      units: { length: "mm", rotation: "quaternion_xyzw" },
      measured_at: rawWithMeasuredAt.measured_at ?? "2025-01-01T00:00:00Z",
      parts: parts.map((part) => {
        if (!part.scan_line_mm) {
          throw new Error(`Missing scan_line_mm for ${part.part_id}.`);
        }
        const p0Model = applyTransformToPoint(alignment.T_model_scan, part.scan_line_mm.p0);
        const p1Model = applyTransformToPoint(alignment.T_model_scan, part.scan_line_mm.p1);
        const translation = midpoint(p0Model, p1Model);
        const transform: Transform = {
          translation_mm: translation,
          rotation_quat_xyzw: identityQuat
        };
        return {
          part_id: part.part_id,
          T_world_part_asBuilt: transform,
          pose_confidence: part.pose_confidence ?? 1,
          confidence_notes: part.confidence_notes
        };
      })
    };

    const actual = generateDirectives({ nominal, asBuilt, constraints });

    assert.equal(nominal.parts.length, 3);
    assert.equal(actual.steps.length, nominal.parts.length);
    sameStringArrayAsSet(
      actual.steps.map((step) => step.part_id),
      ["MULLION_0001", "MULLION_0002", "MULLION_0003"]
    );
  });
});
