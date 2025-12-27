import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { generateDirectives } from "../core";
import type { AsBuiltPosesDataset, ConstraintsDataset, DirectivesOutput, NominalPosesDataset, Vec3 } from "../types.js";

const EPS = 1e-6;

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

function close(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ~ ${b}`);
}

function closeVec(a: Vec3, b: Vec3, eps = EPS) {
  close(a[0], b[0], eps);
  close(a[1], b[1], eps);
  close(a[2], b[2], eps);
}

function sameStringArrayAsSet(a: string[], b: string[]) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  assert.deepEqual(sa, sb);
}

async function main() {
  const nominalPath = "datasets/toy_v0_1/toy_nominal_poses.json";
  const asBuiltPath = "datasets/toy_v0_1/toy_asbuilt_poses.json";
  const constraintsPath = "datasets/toy_v0_1/toy_constraints.json";
  const expectedPath = "datasets/toy_v0_1/expected_directives.json";

  const nominal = await readJson<NominalPosesDataset>(nominalPath);
  const asBuilt = await readJson<AsBuiltPosesDataset>(asBuiltPath);
  const constraints = await readJson<ConstraintsDataset>(constraintsPath);
  const expected = await readJson<DirectivesOutput>(expectedPath);

  const actual = generateDirectives(
    nominal,
    asBuilt,
    constraints,
    {
      inputPaths: { nominal: expected.inputs.nominal_poses, asBuilt: expected.inputs.as_built_poses, constraints: expected.inputs.constraints },
      engineVersion: expected.engine_version
    }
  );

  // Top-level invariants
  assert.equal(actual.schema_version, expected.schema_version);
  assert.equal(actual.dataset_id, expected.dataset_id);
  assert.equal(actual.engine_version, expected.engine_version);

  // generated_at is deterministic in our engine, but don't make the test brittle.
  assert.ok(typeof actual.generated_at === "string" && actual.generated_at.length > 0);

  // Summary counts
  assert.deepEqual(actual.summary.counts_by_status, expected.summary.counts_by_status);

  // Steps
  assert.equal(actual.steps.length, expected.steps.length);

  for (let i = 0; i < expected.steps.length; i++) {
    const e = expected.steps[i];
    const a = actual.steps[i];

    assert.equal(a.part_id, e.part_id);
    assert.equal(a.status, e.status);
    sameStringArrayAsSet(a.reason_codes, e.reason_codes);

    if (typeof e.pose_confidence === "number") {
      close(a.pose_confidence ?? 0, e.pose_confidence);
    }

    closeVec(a.computed_errors.translation_error_mm_vec, e.computed_errors.translation_error_mm_vec);
    close(a.computed_errors.translation_error_norm_mm, e.computed_errors.translation_error_norm_mm);
    close(a.computed_errors.rotation_error_deg, e.computed_errors.rotation_error_deg);

    // Actions: compare structure + deltas, ignore description strings.
    assert.equal(a.actions.length, e.actions.length);
    for (let j = 0; j < e.actions.length; j++) {
      const ea = e.actions[j];
      const aa = a.actions[j];

      assert.equal(aa.type, ea.type);
      if (ea.axis) assert.equal(aa.axis, ea.axis);
      if (typeof ea.target_index === "number") assert.equal(aa.target_index, ea.target_index);

      if (ea.type === "noop") continue;

      assert.ok(aa.delta && ea.delta, "Expected delta in non-noop action");
      closeVec(aa.delta!.translation_mm, ea.delta!.translation_mm);
      // quat close
      for (let k = 0; k < 4; k++) close(aa.delta!.rotation_quat_xyzw[k], ea.delta!.rotation_quat_xyzw[k], 1e-6);

      if (typeof ea.clamp_applied === "boolean") {
        assert.equal(aa.clamp_applied, ea.clamp_applied);
      }
      if (ea.original_delta) {
        assert.ok(aa.original_delta);
        closeVec(aa.original_delta!.translation_mm, ea.original_delta.translation_mm);
      }
    }

    // Verification: compare type + acceptance + residual + expected_result; ignore notes.
    assert.equal(a.verification.length, e.verification.length);
    for (let j = 0; j < e.verification.length; j++) {
      const ev = e.verification[j];
      const av = a.verification[j];
      assert.equal(av.type, ev.type);
      close(av.acceptance.translation_mm, ev.acceptance.translation_mm);
      close(av.acceptance.rotation_deg, ev.acceptance.rotation_deg);
      closeVec(av.expected_residual.translation_mm_vec, ev.expected_residual.translation_mm_vec);
      close(av.expected_residual.rotation_deg, ev.expected_residual.rotation_deg);
      assert.equal(av.expected_result, ev.expected_result);
    }
  }

  console.log("✅ Golden test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
