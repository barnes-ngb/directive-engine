import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { DirectivesOutput, Step } from "../types.js";
import {
  formatActionSummary,
  formatConfidence,
  formatNumber,
  formatVec3,
  getPrimaryAction,
  normalizeCounts
} from "../web/renderHelpers.js";

const sampleSummary: DirectivesOutput["summary"] = {
  counts_by_status: {
    ok: 1,
    pending: 2,
    clamped: 0,
    blocked: 3,
    needs_review: 1
  }
};

const sampleStep: Step = {
  step_id: "S1",
  part_id: "P1",
  status: "pending",
  reason_codes: ["translation_out_of_tolerance"],
  pose_confidence: 0.88,
  computed_errors: {
    translation_error_mm_vec: [1, 2, 3],
    translation_error_norm_mm: 3.74,
    rotation_error_deg: 4
  },
  actions: [
    {
      action_id: "A1",
      type: "translate",
      description: "Translate",
      delta: {
        translation_mm: [1, 2, 3],
        rotation_quat_xyzw: [0, 0, 0, 1]
      },
      clamp_applied: false
    }
  ],
  verification: []
};

describe("renderHelpers", () => {
  it("normalizes counts", () => {
    const normalized = normalizeCounts(sampleSummary);
    assert.equal(normalized.ok, 1);
    assert.equal(normalized.pending, 2);
    assert.equal(normalized.clamped, 0);
    assert.equal(normalized.blocked, 3);
    assert.equal(normalized.needs_review, 1);

    const empty = normalizeCounts();
    assert.equal(empty.ok, 0);
    assert.equal(empty.pending, 0);
  });

  it("formats values for display", () => {
    assert.equal(formatNumber(1.2345, 2), "1.23");
    assert.equal(formatNumber("nope" as unknown as number, 2), "—");
    assert.equal(formatVec3([1, 2, 3], 1), "1.0, 2.0, 3.0");
    assert.equal(formatVec3(undefined, 1), "—");
    assert.equal(formatConfidence(0.845), "84.5%");
    assert.equal(formatConfidence(undefined), "—");
  });

  it("summarizes the primary action", () => {
    const primary = getPrimaryAction(sampleStep);
    assert.equal(primary?.type, "translate");
    assert.equal(formatActionSummary(primary), "Translate by [1.0, 2.0, 3.0] mm");
    assert.equal(formatActionSummary(undefined), "No action");
  });
});
