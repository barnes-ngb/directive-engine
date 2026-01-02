import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ConstraintsDataset } from "../types.js";
import type { MuseumRawDataset } from "../core/convert/museumAnchors.js";
import { normalizeMuseumAnchors } from "../core/convert/museumAnchors.js";

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
  it("normalizes anchors from museum facade dataset", async () => {
    const rawPath = "datasets/museum_facade_v0_1/directive_engine_export/museum_raw.json";
    const constraintsPath =
      "datasets/museum_facade_v0_1/directive_engine_export/museum_constraints.json";

    const raw = await readJson<MuseumRawDataset>(rawPath);
    await readJson<ConstraintsDataset>(constraintsPath);

    const anchors = normalizeMuseumAnchors(raw);

    assert.equal(anchors.length, raw.anchors.length);

    anchors.forEach((anchor, index) => {
      assert.ok(anchor.id && anchor.id.length > 0, `Expected anchor id at index ${index}`);
      assert.ok(isVec3(anchor.model_mm), `Expected model_mm Vec3 for anchor ${anchor.id}`);
      assert.ok(isVec3(anchor.scan_mm), `Expected scan_mm Vec3 for anchor ${anchor.id}`);
    });

    assert.ok(anchors.some((anchor) => anchor.id === "A001"));
    assert.ok(anchors.some((anchor) => anchor.id === "A002"));
  });
});
