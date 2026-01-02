import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { MuseumRawDataset } from "../core/index.js";
import { anchorsToPointPairs, computeRigidTransform } from "../core/index.js";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

describe("museum dataset pipeline", () => {
  it("converts anchors and computes rigid transform from museum facade dataset", async () => {
    const rawPath = "datasets/museum_facade_v0_1/directive_engine_export/museum_raw.json";

    const raw = await readJson<MuseumRawDataset>(rawPath);

    const { scanPts, modelPts } = anchorsToPointPairs(raw);

    assert.equal(scanPts.length, raw.anchors.length);
    assert.equal(modelPts.length, raw.anchors.length);

    scanPts.forEach((pt, index) => {
      assert.ok(pt.anchor_id && pt.anchor_id.length > 0, `Expected anchor_id at index ${index}`);
      assert.ok(isVec3(pt.point_mm), `Expected point_mm Vec3 for scan anchor ${pt.anchor_id}`);
    });

    modelPts.forEach((pt, index) => {
      assert.ok(pt.anchor_id && pt.anchor_id.length > 0, `Expected anchor_id at index ${index}`);
      assert.ok(isVec3(pt.point_mm), `Expected point_mm Vec3 for model anchor ${pt.anchor_id}`);
    });

    assert.ok(scanPts.some((pt) => pt.anchor_id === "A001"));
    assert.ok(scanPts.some((pt) => pt.anchor_id === "A002"));

    const result = computeRigidTransform(scanPts, modelPts);

    assert.ok(result.T_model_scan, "Expected T_model_scan transform");
    assert.ok(typeof result.rms_mm === "number", "Expected rms_mm to be a number");
    assert.ok(Array.isArray(result.residuals_mm), "Expected residuals_mm array");
    assert.equal(result.residuals_mm.length, raw.anchors.length);
  });
});
