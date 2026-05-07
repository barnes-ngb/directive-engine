import { describe, expect, it } from "vitest";
import { formatDirective } from "./format-directive.js";
import type { PartConstraint, Step } from "../core/types.js";

const baseTolerances = { translation_mm: 2.0, rotation_deg: 1.0 };

function makeConstraint(overrides: Partial<PartConstraint> = {}): PartConstraint {
  return {
    part_id: "P1",
    allowed_translation_axes: { x: true, y: true, z: false },
    rotation_mode: "fixed",
    allowed_rotation_axes: { x: false, y: false, z: false },
    tolerances: baseTolerances,
    ...overrides,
  };
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    step_id: "S1",
    part_id: "P1",
    status: "pending",
    reason_codes: ["translation_out_of_tolerance", "translate_only"],
    pose_confidence: 0.9,
    computed_errors: {
      translation_error_mm_vec: [0, 0, 0],
      translation_error_norm_mm: 0,
      rotation_error_deg: 0,
    },
    actions: [],
    verification: [],
    ...overrides,
  };
}

describe("formatDirective — translate", () => {
  it("renders against a named slot when axis aligns", () => {
    const constraint = makeConstraint({
      features: [
        {
          id: "S2",
          kind: "slot",
          position_mm: [0, 0, 0],
          axis: [0, 1, 0],
          description: "Vertical slot",
        },
      ],
    });
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "engine description ignored by formatter",
          delta: { translation_mm: [0, 3.2, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("along slot S2");
    expect(result).toContain("+3.2mm");
    expect(result).toContain("Vertical slot");
    expect(result).toContain("Status: pending");
    expect(result).toContain("Tolerance: ±2.0mm");
  });

  it("falls back to part-frame language when no features declared", () => {
    const constraint = makeConstraint();
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [0, 3.2, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("along part-frame Y");
    expect(result).toContain("+3.2mm");
    expect(result).not.toContain("slot");
  });

  it("preserves negative direction along slot axis", () => {
    const constraint = makeConstraint({
      features: [
        { id: "S1", kind: "slot", position_mm: [0, 0, 0], axis: [1, 0, 0] },
      ],
    });
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [-3.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("along slot S1");
    expect(result).toContain("-3.2mm");
  });
});

describe("formatDirective — rotate", () => {
  it("renders pivot about a named joint", () => {
    const constraint = makeConstraint({
      rotation_mode: "free",
      allowed_rotation_axes: { x: true, y: false, z: false },
      features: [
        {
          id: "J1",
          kind: "joint",
          position_mm: [0, 0, 0],
          axis: [1, 0, 0],
          description: "CCW from outside face",
        },
      ],
    });
    // Quaternion: ~5° about +X. Half-angle = 2.5°. sin(2.5°) ≈ 0.04362.
    const step = makeStep({
      reason_codes: ["rotation_out_of_tolerance"],
      actions: [
        {
          action_id: "A1",
          type: "rotate",
          description: "_",
          axis: "x",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0.04362, 0, 0, 0.99905] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toMatch(/Pivot \+5\.0° about J1/);
    expect(result).toContain("CCW from outside face");
  });

  it("falls back to part-frame rotation when no joint feature declared", () => {
    const constraint = makeConstraint({
      rotation_mode: "free",
      allowed_rotation_axes: { x: true, y: false, z: false },
    });
    const step = makeStep({
      reason_codes: ["rotation_out_of_tolerance"],
      actions: [
        {
          action_id: "A1",
          type: "rotate",
          description: "_",
          axis: "x",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0.04362, 0, 0, 0.99905] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("about part-frame +X");
    expect(result).not.toContain("about J");
  });
});

describe("formatDirective — rotate_to_index", () => {
  it("renders against a named index pattern", () => {
    const constraint = makeConstraint({
      rotation_mode: "index",
      allowed_rotation_axes: { x: false, y: false, z: true },
      features: [
        { id: "I1", kind: "index", position_mm: [0, 0, 0], axis: [0, 0, 1], count: 4 },
      ],
    });
    const step = makeStep({
      reason_codes: ["rotation_out_of_tolerance", "index_rotation"],
      actions: [
        {
          action_id: "A1",
          type: "rotate_to_index",
          description: "_",
          axis: "z",
          target_index: 1,
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("Rotate to index 1 on I1");
  });

  it("falls back to detent language when no index feature declared", () => {
    const constraint = makeConstraint({
      rotation_mode: "index",
      allowed_rotation_axes: { x: false, y: false, z: true },
    });
    const step = makeStep({
      reason_codes: ["rotation_out_of_tolerance", "index_rotation"],
      actions: [
        {
          action_id: "A1",
          type: "rotate_to_index",
          description: "_",
          axis: "z",
          target_index: 2,
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    expect(formatDirective(step, constraint)).toContain("detent index 2 about part-frame +Z");
  });
});

describe("formatDirective — combined and edge cases", () => {
  it("joins multiple action clauses in order", () => {
    const constraint = makeConstraint({
      rotation_mode: "free",
      allowed_rotation_axes: { x: true, y: false, z: false },
      features: [
        { id: "J1", kind: "joint", position_mm: [0, 0, 0], axis: [1, 0, 0] },
        { id: "S2", kind: "slot", position_mm: [0, 0, 0], axis: [0, 1, 0] },
      ],
    });
    const step = makeStep({
      reason_codes: ["translation_out_of_tolerance", "rotation_out_of_tolerance"],
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [0, 3.2, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
        {
          action_id: "A2",
          type: "rotate",
          description: "_",
          axis: "x",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0.00349, 0, 0, 0.99999] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step, constraint);
    const translateIdx = result.indexOf("along slot S2");
    const rotateIdx = result.indexOf("about J1");
    expect(translateIdx).toBeGreaterThan(-1);
    expect(rotateIdx).toBeGreaterThan(translateIdx);
  });

  it("zero-magnitude translation reads as hold position", () => {
    const constraint = makeConstraint();
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    expect(formatDirective(step, constraint)).toContain("Hold position");
  });

  it("clamped status surfaces a clamp bound clause instead of tolerance", () => {
    const constraint = makeConstraint({
      translation_max_abs_mm: { x: 5, y: 5, z: 0 },
      tolerances: { translation_mm: 5.0, rotation_deg: 2.0 },
      features: [
        { id: "S1", kind: "slot", position_mm: [0, 0, 0], axis: [1, 0, 0] },
      ],
    });
    const step = makeStep({
      status: "clamped",
      reason_codes: ["translation_out_of_tolerance", "clamped_to_limits", "translate_clamped"],
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [-5.0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: true,
          original_delta: {
            translation_mm: [-10.0, 0, 0],
            rotation_quat_xyzw: [0, 0, 0, 1],
          },
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("Status: clamped");
    expect(result).toContain("clamped at 5.0mm bound");
    expect(result).not.toMatch(/Tolerance: ±/);
  });

  it("blocked status produces an escalation directive", () => {
    const constraint = makeConstraint({
      translation_max_norm_mm: 20,
      tolerances: { translation_mm: 2.0, rotation_deg: 1.0 },
    });
    const step = makeStep({
      status: "blocked",
      reason_codes: ["outside_limits_blocked", "translation_exceeds_max_norm"],
      actions: [],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("Blocked");
    expect(result).toContain("escalate");
    expect(result).toContain("Status: blocked");
    expect(result).toContain("20.0mm");
  });

  it("within_tolerance noop reads as no adjustment required", () => {
    const constraint = makeConstraint();
    const step = makeStep({
      status: "ok",
      reason_codes: ["within_tolerance"],
      actions: [
        {
          action_id: "A1",
          type: "noop",
          description: "_",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("No adjustment required");
    expect(result).toContain("Status: ok");
  });

  it("low confidence noop asks for re-scan", () => {
    const constraint = makeConstraint();
    const step = makeStep({
      status: "needs_review",
      reason_codes: ["low_confidence"],
      actions: [
        {
          action_id: "A1",
          type: "noop",
          description: "_",
          delta: { translation_mm: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
        },
      ],
    });
    const result = formatDirective(step, constraint);
    expect(result).toContain("re-scan");
    expect(result).toContain("Status: needs_review");
  });

  it("works without a constraint argument (no tolerance clause)", () => {
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [0, 3.2, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    const result = formatDirective(step);
    expect(result).toContain("along part-frame Y");
    expect(result).toContain("Status: pending");
    expect(result).not.toMatch(/Tolerance/);
  });

  it("rounds mm and degrees to one decimal", () => {
    const constraint = makeConstraint();
    const step = makeStep({
      actions: [
        {
          action_id: "A1",
          type: "translate",
          description: "_",
          delta: { translation_mm: [0, 3.234567, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
          clamp_applied: false,
        },
      ],
    });
    expect(formatDirective(step, constraint)).toContain("+3.2mm");
  });
});
