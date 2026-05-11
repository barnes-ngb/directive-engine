import { describe, expect, it } from "vitest";
import { loadToyFacadeFixture } from "../load-fixture.js";
import { buildEngineBundle, pickFocusedPart } from "../engine-bridge.js";

describe("engine-bridge", () => {
  it("runs generateDirectives on the toy facade and exposes steps", () => {
    const fixture = loadToyFacadeFixture();
    const bundle = buildEngineBundle(fixture);
    expect(bundle.output.schema_version).toBe("v0.1");
    expect(bundle.output.steps.length).toBeGreaterThan(0);
    expect(bundle.stepByPartId.size).toBe(bundle.output.steps.length);
    expect(bundle.constraintById.size).toBe(bundle.constraints.parts.length);
  });

  it("computes before/after deviation metrics", () => {
    const fixture = loadToyFacadeFixture();
    const bundle = buildEngineBundle(fixture);
    expect(bundle.beforeMaxDeviationMm).toBeGreaterThan(0);
    expect(bundle.afterMaxDeviationMm).toBeLessThanOrEqual(
      bundle.beforeMaxDeviationMm,
    );
  });

  it("memoizes results for the same fixture instance", () => {
    const fixture = loadToyFacadeFixture();
    const a = buildEngineBundle(fixture);
    const b = buildEngineBundle(fixture);
    expect(a).toBe(b);
  });

  it("pickFocusedPart selects a non-ok part with the largest deviation", () => {
    const fixture = loadToyFacadeFixture();
    const bundle = buildEngineBundle(fixture);
    const focused = pickFocusedPart(bundle);
    expect(focused).not.toBeNull();
    const step = bundle.stepByPartId.get(focused!);
    expect(step).toBeDefined();
  });
});
