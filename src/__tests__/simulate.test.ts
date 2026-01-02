import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { simulateStep } from "../core/index.js";
import type { Step, Tolerances, Transform } from "../types.js";

const EPS = 1e-6;

function close(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ~ ${b}`);
}

function identityQuat(): [number, number, number, number] {
  return [0, 0, 0, 1];
}

describe("simulateStep", () => {
  it("returns canSimulate=false for blocked status", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [10, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "blocked",
      reason_codes: ["blocked"],
      computed_errors: {
        translation_error_mm_vec: [10, 0, 0],
        translation_error_norm_mm: 10,
        rotation_error_deg: 0
      },
      actions: [],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 1,
      rotation_deg: 1
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, false);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.directiveDelta, null);
  });

  it("returns canSimulate=false for needs_review status", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [5, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "needs_review",
      reason_codes: ["low_confidence"],
      computed_errors: {
        translation_error_mm_vec: [5, 0, 0],
        translation_error_norm_mm: 5,
        rotation_error_deg: 0
      },
      actions: [{
        action_id: "A1",
        type: "noop",
        description: "No action",
        delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: identityQuat() }
      }],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 1,
      rotation_deg: 1
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, false);
    assert.strictEqual(result.pass, false);
  });

  it("simulates a translate action and passes tolerance check", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [-5, 0, 0], // 5mm off in -X
      rotation_quat_xyzw: identityQuat()
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "pending",
      reason_codes: ["translation_out_of_tolerance"],
      computed_errors: {
        translation_error_mm_vec: [5, 0, 0], // error = nominal - asbuilt = 0 - (-5) = 5
        translation_error_norm_mm: 5,
        rotation_error_deg: 0
      },
      actions: [{
        action_id: "A1",
        type: "translate",
        description: "Translate to nominal",
        delta: {
          translation_mm: [5, 0, 0], // move +5 in X to reach nominal
          rotation_quat_xyzw: identityQuat()
        }
      }],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 0.5,
      rotation_deg: 1
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, true);
    assert.strictEqual(result.pass, true);

    // Before error should match step.computed_errors
    close(result.beforeError.translation_norm_mm, 5);

    // After error should be ~0 since we applied the full correction
    close(result.afterError.translation_norm_mm, 0, 0.01);

    // Directive delta should be [5, 0, 0]
    assert.ok(result.directiveDelta !== null);
    if (result.directiveDelta) {
      close(result.directiveDelta.translation_mm_vec[0], 5);
    }
  });

  it("simulates a clamped translate action and fails tolerance check", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [-10, 0, 0], // 10mm off in -X
      rotation_quat_xyzw: identityQuat()
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "clamped",
      reason_codes: ["clamped_to_limits"],
      computed_errors: {
        translation_error_mm_vec: [10, 0, 0],
        translation_error_norm_mm: 10,
        rotation_error_deg: 0
      },
      actions: [{
        action_id: "A1",
        type: "translate",
        description: "Translate clamped",
        delta: {
          translation_mm: [5, 0, 0], // clamped to 5mm max
          rotation_quat_xyzw: identityQuat()
        },
        clamp_applied: true,
        original_delta: {
          translation_mm: [10, 0, 0],
          rotation_quat_xyzw: identityQuat()
        }
      }],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 1,
      rotation_deg: 1
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, true);
    assert.strictEqual(result.pass, false); // Still 5mm off after clamped correction

    // After applying clamped delta of [5,0,0], asBuilt goes from [-10,0,0] to [-5,0,0]
    // Error to nominal [0,0,0] is still [5,0,0], norm = 5mm
    close(result.afterError.translation_norm_mm, 5, 0.01);
  });

  it("simulates an ok/noop action with no error change", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [0.1, 0, 0], // Already within tolerance
      rotation_quat_xyzw: identityQuat()
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "ok",
      reason_codes: ["within_tolerance"],
      computed_errors: {
        translation_error_mm_vec: [-0.1, 0, 0],
        translation_error_norm_mm: 0.1,
        rotation_error_deg: 0
      },
      actions: [{
        action_id: "A1",
        type: "noop",
        description: "No adjustment required",
        delta: {
          translation_mm: [0, 0, 0],
          rotation_quat_xyzw: identityQuat()
        }
      }],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 0.5,
      rotation_deg: 1
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, true);
    assert.strictEqual(result.pass, true); // Already within tolerance

    // Error should remain the same
    close(result.beforeError.translation_norm_mm, 0.1, 0.01);
    close(result.afterError.translation_norm_mm, 0.1, 0.01);
  });

  it("computes rotation delta degrees from quaternion", () => {
    const nominalPose: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: identityQuat()
    };
    const asBuiltPose: Transform = {
      translation_mm: [0, 0, 0],
      // Rotated 90 degrees about Z axis
      rotation_quat_xyzw: [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    };
    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "pending",
      reason_codes: ["rotation_out_of_tolerance"],
      computed_errors: {
        translation_error_mm_vec: [0, 0, 0],
        translation_error_norm_mm: 0,
        rotation_error_deg: 90
      },
      actions: [{
        action_id: "A1",
        type: "rotate",
        axis: "z",
        description: "Rotate back",
        delta: {
          translation_mm: [0, 0, 0],
          // Rotate -90 degrees about Z to get back to identity
          rotation_quat_xyzw: [0, 0, -Math.SQRT1_2, Math.SQRT1_2]
        }
      }],
      verification: []
    };
    const tolerances: Tolerances = {
      translation_mm: 1,
      rotation_deg: 5
    };

    const result = simulateStep({ nominalPose, asBuiltPose, step, tolerances });

    assert.strictEqual(result.canSimulate, true);
    assert.ok(result.directiveDelta !== null);

    // Delta rotation should be ~90 degrees
    if (result.directiveDelta) {
      close(result.directiveDelta.rotation_deg, 90, 1);
    }

    // After applying the rotation, error should be near zero
    close(result.afterError.rotation_deg, 0, 1);
    assert.strictEqual(result.pass, true);
  });
});
