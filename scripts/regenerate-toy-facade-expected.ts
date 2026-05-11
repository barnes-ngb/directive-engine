#!/usr/bin/env tsx
/**
 * Regenerate datasets/toy_facade_v1/expected_directives.json from the
 * current nominal/as_built/constraints JSON files, via the engine.
 *
 * The legacy expected_directives.json file is documentary (not consumed by
 * tests; toy_facade_v1 is not part of the v0.1 golden suite). This script
 * keeps it honest after the Phase 6 panel expansion.
 *
 * Usage:  npx tsx scripts/regenerate-toy-facade-expected.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEngineBundle } from "../src/viewer/engine-bridge.js";
import type { Action } from "../src/core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FIXTURE = join(ROOT, "datasets/toy_facade_v1");

function readJson(p: string): any {
  return JSON.parse(readFileSync(p, "utf8"));
}

const nominal = readJson(join(FIXTURE, "nominal.json"));
const asBuilt = readJson(join(FIXTURE, "as_built.json"));
const constraintsRaw = readJson(join(FIXTURE, "constraints.json"));

const fixture = {
  jobId: nominal.job.jobId,
  units: "mm" as const,
  parts: nominal.parts.map((p: any) => {
    const ab = asBuilt.parts.find((q: any) => q.partId === p.partId);
    return {
      partId: p.partId,
      nominal: { t: p.T_world_part_nominal.t, q: p.T_world_part_nominal.q },
      asBuilt: ab
        ? { t: ab.T_world_part_asBuilt.t, q: ab.T_world_part_asBuilt.q }
        : undefined,
      asBuiltConfidence: ab?.confidence,
    };
  }),
  constraintsRaw,
};

const bundle = buildEngineBundle(fixture);

function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function serializeAction(a: Action): unknown {
  if (a.type === "translate") {
    return {
      type: "translate",
      frame: (a as any).frame ?? "part",
      vectorMm: ((a as any).delta?.translation_mm ?? [0, 0, 0]).map((x: number) =>
        round(x, 3),
      ),
    };
  }
  if (a.type === "rotate") {
    return {
      type: "rotate",
      frame: (a as any).frame ?? "part",
      axis: (a as any).axis,
      quaternionXYZW: (
        (a as any).delta?.rotation_quat_xyzw ?? [0, 0, 0, 1]
      ).map((x: number) => round(x, 6)),
    };
  }
  if (a.type === "rotate_to_index") {
    return {
      type: "rotate_to_index",
      frame: (a as any).frame ?? "part",
      axis: (a as any).axis,
      index: (a as any).target_index,
    };
  }
  return a;
}

const out = {
  jobId: fixture.jobId,
  generatedAt: new Date().toISOString(),
  metrics: {
    beforeMaxDeviationMm: round(bundle.beforeMaxDeviationMm, 3),
    afterMaxDeviationMm: round(bundle.afterMaxDeviationMm, 3),
  },
  steps: bundle.output.steps.map((s, i) => ({
    stepId: `S-${String(i + 1).padStart(4, "0")}`,
    partId: s.part_id,
    priority: i + 1,
    status: s.status,
    actions: s.actions.map(serializeAction),
    verification: {
      type: "rescan",
      passIfMaxDeviationMm: 2.0,
    },
    notes: (s as any).installer_notes ?? [],
  })),
};

const outPath = join(FIXTURE, "expected_directives.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(
  `  steps=${out.steps.length}  beforeMax=${out.metrics.beforeMaxDeviationMm}mm  afterMax=${out.metrics.afterMaxDeviationMm}mm`,
);
