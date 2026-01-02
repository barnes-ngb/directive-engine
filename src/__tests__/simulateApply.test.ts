import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  Vec3
} from "../types.js";
import { computePoseError, simulateStep } from "../core/sim/simulateApply.js";

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

describe("simulateApply helper", () => {
  it("matches computed errors and expected residuals for toy dataset", async () => {
    const nominalPath = "datasets/toy_v0_1/toy_nominal_poses.json";
    const asBuiltPath = "datasets/toy_v0_1/toy_asbuilt_poses.json";
    const constraintsPath = "datasets/toy_v0_1/toy_constraints.json";
    const directivesPath = "datasets/toy_v0_1/expected_directives.json";

    const nominal = await readJson<NominalPosesDataset>(nominalPath);
    const asBuilt = await readJson<AsBuiltPosesDataset>(asBuiltPath);
    const constraints = await readJson<ConstraintsDataset>(constraintsPath);
    const directives = await readJson<DirectivesOutput>(directivesPath);

    const nominalById = new Map(nominal.parts.map((part) => [part.part_id, part]));
    const asBuiltById = new Map(asBuilt.parts.map((part) => [part.part_id, part]));
    const constraintsById = new Map(constraints.parts.map((part) => [part.part_id, part]));

    for (const partId of ["P2", "P3"]) {
      const step = directives.steps.find((s) => s.part_id === partId);
      assert.ok(step, `Missing directive step for ${partId}`);

      const nominalPose = nominalById.get(partId)?.T_world_part_nominal;
      const asBuiltPose = asBuiltById.get(partId)?.T_world_part_asBuilt;
      const tolerances = constraintsById.get(partId)?.tolerances;
      assert.ok(nominalPose && asBuiltPose && tolerances, `Missing data for ${partId}`);

      const before = computePoseError(nominalPose, asBuiltPose);
      closeVec(before.t_err_vec, step.computed_errors.translation_error_mm_vec);
      close(before.t_err_norm, step.computed_errors.translation_error_norm_mm);
      close(before.rot_err_deg, step.computed_errors.rotation_error_deg);

      const simulation = simulateStep(nominalPose, asBuiltPose, step, tolerances);
      const expectedResidual = step.verification[0]?.expected_residual;
      assert.ok(expectedResidual, `Missing expected residual for ${partId}`);
      closeVec(simulation.after.t_err_vec, expectedResidual.translation_mm_vec);
      close(simulation.after.rot_err_deg, expectedResidual.rotation_deg);

      const expectedResult = step.verification[0]?.expected_result;
      if (expectedResult && expectedResult !== "unknown") {
        const expectedPass = expectedResult === "expected_pass";
        assert.equal(simulation.pass, expectedPass);
      }
    }
  });
});
