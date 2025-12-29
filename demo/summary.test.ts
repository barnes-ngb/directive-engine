import { describe, expect, it } from "vitest";
import type { Action, DirectivesOutput, Step } from "../src/types.js";
import {
  describeAction,
  deriveOverallStatus,
  extractPartSummaries,
  formatResidual,
  STATUS_PRIORITY
} from "./summary.js";

type DirectivesWithStepMap = Omit<DirectivesOutput, "steps"> & {
  steps: Record<string, Step>;
};

const baseStep: Step = {
  step_id: "S1",
  part_id: "P1",
  status: "pending",
  reason_codes: [],
  computed_errors: {
    translation_error_mm_vec: [0, 0, 0],
    translation_error_norm_mm: 0,
    rotation_error_deg: 0
  },
  actions: [],
  verification: []
};

const baseDirectives: DirectivesOutput = {
  schema_version: "v0.1",
  dataset_id: "dataset-1",
  engine_version: "engine-1",
  generated_at: "2024-01-01T00:00:00Z",
  inputs: {
    nominal_poses: "nominal.json",
    as_built_poses: "asbuilt.json",
    constraints: "constraints.json",
    confidence_threshold: 0.9
  },
  summary: {
    counts_by_status: {
      ok: 0,
      pending: 0,
      clamped: 0,
      blocked: 0,
      needs_review: 0
    }
  },
  steps: [baseStep]
};

describe("extractPartSummaries", () => {
  it("handles steps as an array", () => {
    const steps: Step[] = [
      { ...baseStep, step_id: "S1", part_id: "P1", status: "pending" },
      { ...baseStep, step_id: "S2", part_id: "P2", status: "ok" }
    ];
    const summaries = extractPartSummaries({ ...baseDirectives, steps });

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.id)).toEqual(["P1", "P2"]);
    expect(summaries[1].status).toBe("ok");
  });

  it("handles steps as a map keyed by part id", () => {
    const stepMap: Record<string, Step> = {
      P2: { ...baseStep, step_id: "S2", part_id: "P2", status: "ok" },
      P1: { ...baseStep, step_id: "S1", part_id: "P1", status: "blocked" }
    };
    const directives: DirectivesWithStepMap = { ...baseDirectives, steps: stepMap };
    const summaries = extractPartSummaries(directives);

    expect(summaries.map((summary) => summary.id)).toEqual(["P1", "P2"]);
    expect(summaries[0].status).toBe("blocked");
  });
});

describe("deriveOverallStatus", () => {
  it("returns the highest-priority status from summary counts", () => {
    const directives: DirectivesOutput = {
      ...baseDirectives,
      summary: {
        counts_by_status: {
          ok: 5,
          pending: 1,
          clamped: 0,
          blocked: 2,
          needs_review: 3
        }
      }
    };

    const parts = extractPartSummaries(directives);
    expect(deriveOverallStatus(parts, directives)).toBe(STATUS_PRIORITY[0]);
  });

  it("aggregates statuses from steps when summary is empty", () => {
    const steps: Step[] = [
      { ...baseStep, step_id: "S1", part_id: "P1", status: "clamped" },
      { ...baseStep, step_id: "S2", part_id: "P2", status: "pending" }
    ];

    const directives: DirectivesOutput = {
      ...baseDirectives,
      summary: {
        counts_by_status: {
          ok: 0,
          pending: 0,
          clamped: 0,
          blocked: 0,
          needs_review: 0
        }
      },
      steps
    };

    const parts = extractPartSummaries(directives);
    expect(deriveOverallStatus(parts, directives)).toBe("clamped");
  });
});

describe("formatResidual", () => {
  it("formats numbers consistently", () => {
    expect(formatResidual(1.2345)).toBe("1.23");
    expect(formatResidual(2)).toBe("2.00");
  });

  it("returns n/a for null", () => {
    expect(formatResidual(null)).toBe("n/a");
  });
});

describe("describeAction", () => {
  it("describes translation actions with delta", () => {
    const action: Action = {
      action_id: "A1",
      type: "translate",
      description: "Translate",
      delta: {
        translation_mm: [1, 2, 3],
        rotation_quat_xyzw: [0, 0, 0, 1]
      },
      clamp_applied: false
    };

    expect(describeAction(action)).toBe("Translate (Δt: [1.00, 2.00, 3.00] mm)");
  });

  it("describes rotation actions with and without axis", () => {
    const withAxis: Action = {
      action_id: "A2",
      type: "rotate",
      description: "Rotate",
      axis: "y",
      clamp_applied: false
    };

    const withoutAxis: Action = {
      action_id: "A3",
      type: "rotate",
      description: "Rotate",
      clamp_applied: false
    };

    expect(describeAction(withAxis)).toBe("Rotate (Axis: Y)");
    expect(describeAction(withoutAxis)).toBe("Rotate (Axis: ?)");
  });

  it("describes rotate-to-index actions and no-ops", () => {
    const indexed: Action = {
      action_id: "A4",
      type: "rotate_to_index",
      description: "Rotate to index",
      target_index: 4,
      clamp_applied: false
    };

    const missingIndex: Action = {
      action_id: "A5",
      type: "rotate_to_index",
      description: "Rotate to index",
      clamp_applied: false
    };

    const noop: Action = {
      action_id: "A6",
      type: "noop",
      description: "No action",
      clamp_applied: false
    };

    expect(describeAction(indexed)).toBe("Rotate to index (Index: 4)");
    expect(describeAction(missingIndex)).toBe("Rotate to index (Index: n/a)");
    expect(describeAction(noop)).toBe("No action");
  });
});
