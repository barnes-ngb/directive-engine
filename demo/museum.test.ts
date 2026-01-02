import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTransformToLine, computeRigidTransform } from "../src/core/index.js";
import type { Line3 } from "../src/core/align/apply.js";
import type { MuseumRawDataset } from "./museum.js";
import {
  convertMuseumRawToPoseDatasets,
  DEFAULT_MEASURED_AT,
  deriveMeasuredAt,
  normalizeMuseumAnchors
} from "./museum.js";

type Vec3 = [number, number, number];

type MuseumLine = {
  p0: Vec3;
  p1: Vec3;
};

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

function toLine3(line: MuseumLine): Line3 {
  return { start_mm: line.p0, end_mm: line.p1 };
}

function expectVecClose(actual: Vec3, expected: Vec3, precision = 6): void {
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

describe("convertMuseumRawToPoseDatasets", () => {
  it("uses line midpoints and identity rotation for nominal/as-built parts", () => {
    const fixturePath = resolve(process.cwd(), "demo/public/museum_raw.json");
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as MuseumRawDataset;
    raw.measured_at ??= "2024-01-01T00:00:00Z";

    const anchors = normalizeMuseumAnchors(raw);
    const scanPts = anchors.map((anchor) => ({
      anchor_id: anchor.id,
      point_mm: anchor.scan_mm
    }));
    const modelPts = anchors.map((anchor) => ({
      anchor_id: anchor.id,
      point_mm: anchor.model_mm
    }));
    const alignment = computeRigidTransform(scanPts, modelPts);
    const { nominal, asBuilt } = convertMuseumRawToPoseDatasets(raw, alignment.T_model_scan);

    const partId = "MULLION_0001";
    const rawParts = raw.parts ?? raw.nominal_parts ?? raw.nominal_poses?.parts ?? [];
    const rawPart = rawParts.find((part) => part.part_id === partId);
    expect(rawPart).toBeTruthy();

    const nominalLine = rawPart?.nominal_line_mm as MuseumLine | undefined;
    expect(nominalLine).toBeTruthy();
    const expectedNominalMidpoint = midpoint(nominalLine!.p0, nominalLine!.p1);
    const nominalPart = nominal.parts.find((part) => part.part_id === partId);
    expect(nominalPart?.T_world_part_nominal.translation_mm).toEqual(expectedNominalMidpoint);
    expect(nominalPart?.T_world_part_nominal.rotation_quat_xyzw).toEqual([0, 0, 0, 1]);

    const scanLine = rawPart?.scan_line_mm as MuseumLine | undefined;
    expect(scanLine).toBeTruthy();
    const transformed = applyTransformToLine(alignment.T_model_scan, toLine3(scanLine!));
    const scanMidpoint = midpoint(transformed.start_mm, transformed.end_mm);
    const asBuiltPart = asBuilt.parts.find((part) => part.part_id === partId);
    expect(asBuiltPart?.T_world_part_asBuilt.rotation_quat_xyzw).toEqual([0, 0, 0, 1]);
    expectVecClose(asBuiltPart!.T_world_part_asBuilt.translation_mm, scanMidpoint);
  });
});

describe("deriveMeasuredAt", () => {
  it("parses YYYYMMDD_HHMMSS from dataset_id suffix", () => {
    expect(deriveMeasuredAt("museum_dataset_20251229_073643")).toBe("2025-12-29T07:36:43Z");
    expect(deriveMeasuredAt("test_20240101_120000")).toBe("2024-01-01T12:00:00Z");
    expect(deriveMeasuredAt("prefix_20230615_235959")).toBe("2023-06-15T23:59:59Z");
  });

  it("returns default for non-matching dataset_id", () => {
    expect(deriveMeasuredAt("museum_dataset")).toBe(DEFAULT_MEASURED_AT);
    expect(deriveMeasuredAt("no_date_here")).toBe(DEFAULT_MEASURED_AT);
    expect(deriveMeasuredAt("20251229")).toBe(DEFAULT_MEASURED_AT);
    expect(deriveMeasuredAt("")).toBe(DEFAULT_MEASURED_AT);
  });

  it("conversion uses deriveMeasuredAt when measured_at is missing", () => {
    const fixturePath = resolve(process.cwd(), "demo/public/museum_raw.json");
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as MuseumRawDataset;
    delete (raw as { measured_at?: string }).measured_at;

    const anchors = normalizeMuseumAnchors(raw);
    const scanPts = anchors.map((anchor) => ({
      anchor_id: anchor.id,
      point_mm: anchor.scan_mm
    }));
    const modelPts = anchors.map((anchor) => ({
      anchor_id: anchor.id,
      point_mm: anchor.model_mm
    }));
    const alignment = computeRigidTransform(scanPts, modelPts);
    const { asBuilt } = convertMuseumRawToPoseDatasets(raw, alignment.T_model_scan);

    expect(asBuilt.measured_at).toBe("2025-12-29T07:36:43Z");
  });
});
