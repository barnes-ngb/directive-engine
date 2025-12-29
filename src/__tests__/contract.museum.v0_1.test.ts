import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { generateDirectives } from "../core/generateDirectives.js";
import type { ConstraintsDataset } from "../types.js";
import {
  computeAlignmentFromAnchors,
  convertMuseumRawToPoseDatasets,
  normalizeMuseumAnchors,
  type MuseumRawDataset
} from "../../demo/museum.js";

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

function sameStringArrayAsSet(a: string[], b: string[]) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  assert.deepEqual(sa, sb);
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

    const anchors = normalizeMuseumAnchors(rawWithMeasuredAt);
    const alignment = computeAlignmentFromAnchors(anchors);
    const { nominal, asBuilt } = convertMuseumRawToPoseDatasets(rawWithMeasuredAt, alignment.T_model_scan);

    const actual = generateDirectives({ nominal, asBuilt, constraints });

    assert.equal(nominal.parts.length, 3);
    assert.equal(actual.steps.length, nominal.parts.length);
    sameStringArrayAsSet(
      actual.steps.map((step) => step.part_id),
      ["MULLION_0001", "MULLION_0002", "MULLION_0003"]
    );
  });
});
