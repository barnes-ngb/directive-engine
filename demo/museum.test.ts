import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTransformToPoint, invertTransform } from "../src/core/index.js";
import type { MuseumRawDataset } from "./museum.js";
import {
  computeAlignmentFromAnchors,
  convertMuseumRawToPoseDatasets,
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
    const alignment = computeAlignmentFromAnchors(anchors);
    const { nominal, asBuilt } = convertMuseumRawToPoseDatasets(raw, alignment);

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
    const scanToModel = invertTransform(alignment);
    const scanMidpoint = midpoint(
      applyTransformToPoint(scanToModel, scanLine!.p0),
      applyTransformToPoint(scanToModel, scanLine!.p1)
    );
    const asBuiltPart = asBuilt.parts.find((part) => part.part_id === partId);
    expect(asBuiltPart?.T_world_part_asBuilt.rotation_quat_xyzw).toEqual([0, 0, 0, 1]);
    expectVecClose(asBuiltPart!.T_world_part_asBuilt.translation_mm, scanMidpoint);
  });
});
