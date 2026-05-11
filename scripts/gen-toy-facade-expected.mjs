#!/usr/bin/env node
/**
 * Regenerates datasets/toy_facade_v1/expected_directives.json from the
 * fixture JSONs in that directory.
 *
 * The toy_facade_v1 fixture uses a legacy compact shape (`{ t, q }`) that
 * differs from the engine's v0.1 schemas. We reuse the same mapping logic
 * the viewer applies in `src/viewer/engine-bridge.ts`, then call
 * `generateDirectives` and write a concise summary (status, actions,
 * computed deviation) for human review.
 *
 * Usage: node scripts/gen-toy-facade-expected.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "datasets/toy_facade_v1");

// Run the engine via tsx in a child process so we don't have to teach this
// .mjs file to import TypeScript directly.
const runnerPath = join(__dirname, "_run-toy-facade-engine.ts");
const result = spawnSync("npx", ["--yes", "tsx", runnerPath], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "inherit"],
});

if (result.status !== 0) {
  console.error(`engine runner exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

const output = JSON.parse(result.stdout.toString("utf8"));

// Project the full engine output into the concise legacy summary shape
// that the toy_facade_v1 dataset has shipped with since Phase 0.
let beforeMax = 0;
let afterMax = 0;
for (const s of output.steps) {
  beforeMax = Math.max(beforeMax, s.computed_errors.translation_error_norm_mm);
  const res = s.verification[0]?.expected_residual.translation_mm_vec ?? [0, 0, 0];
  afterMax = Math.max(afterMax, Math.hypot(res[0], res[1], res[2]));
}

const summary = {
  jobId: output.dataset_id,
  generatedAt: output.generated_at,
  countsByStatus: output.summary.counts_by_status,
  metrics: {
    beforeMaxDeviationMm: round1(beforeMax),
    afterMaxDeviationMm: round1(afterMax),
  },
  steps: output.steps.map((s, i) => ({
    stepId: `S-${String(i + 1).padStart(4, "0")}`,
    partId: s.part_id,
    priority: i + 1,
    status: s.status,
    computedDeviationMm: round1(s.computed_errors.translation_error_norm_mm),
    actions: s.actions.map(simplifyAction),
    verification: {
      type: s.verification[0]?.type ?? "measure",
      passIfMaxDeviationMm: s.verification[0]?.acceptance.translation_mm ?? 2.0,
    },
  })),
};

function simplifyAction(a) {
  if (a.type === "noop") return { type: "noop" };
  if (a.type === "translate") {
    const t = a.delta?.translation_mm ?? [0, 0, 0];
    return {
      type: "translate",
      frame: a.frame ?? "part",
      vectorMm: [round1(t[0]), round1(t[1]), round1(t[2])],
      clampApplied: a.clamp_applied ?? false,
    };
  }
  if (a.type === "rotate_to_index" || a.type === "rotate_index") {
    return {
      type: "rotate_to_index",
      frame: a.frame ?? "part",
      axis: a.axis,
      targetIndex: a.target_index,
    };
  }
  if (a.type === "rotate") {
    return {
      type: "rotate",
      frame: a.frame ?? "part",
      axis: a.axis,
      angleDeg: round1(a.angle_deg ?? 0),
    };
  }
  return a;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

const outPath = join(DATA_DIR, "expected_directives.json");
writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} with ${summary.steps.length} steps.`);
