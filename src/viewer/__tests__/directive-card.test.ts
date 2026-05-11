import { describe, expect, it, vi } from "vitest";
import type { PartConstraint, Step } from "../../core/types.js";
import { createDirectiveCard } from "../overlay/directive-card.js";

function pendingStep(): Step {
  return {
    step_id: "S1",
    part_id: "P-0001",
    status: "pending",
    reason_codes: ["translation_out_of_tolerance"],
    pose_confidence: 0.92,
    computed_errors: {
      translation_error_mm_vec: [-3.0, 1.0, 0],
      translation_error_norm_mm: 3.162,
      rotation_error_deg: 0,
    },
    actions: [
      {
        action_id: "A1",
        type: "translate",
        description: "Translate part",
        delta: { translation_mm: [-3.0, 1.0, 0], rotation_quat_xyzw: [0, 0, 0, 1] },
      },
    ],
    verification: [],
  };
}

function okStep(): Step {
  return {
    step_id: "S2",
    part_id: "P-0002",
    status: "ok",
    reason_codes: ["within_tolerance"],
    pose_confidence: 1,
    computed_errors: {
      translation_error_mm_vec: [0.1, 0, 0],
      translation_error_norm_mm: 0.1,
      rotation_error_deg: 0,
    },
    actions: [],
    verification: [],
  };
}

function constraint(): PartConstraint {
  return {
    part_id: "P-0001",
    allowed_translation_axes: { x: true, y: true, z: true },
    rotation_mode: "fixed",
    allowed_rotation_axes: { x: false, y: false, z: false },
    tolerances: { translation_mm: 2.0, rotation_deg: 1.0 },
    features: [
      {
        id: "S2",
        kind: "slot",
        position_mm: [0, 0, 0],
        axis: [1, 0, 0],
        description: "Lateral slot.",
      },
    ],
  };
}

describe("directive-card", () => {
  it("starts hidden", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    expect((card.element as HTMLElement).style.display).toBe("none");
  });

  it("renders part id, mechanical-language directive, and chips", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(pendingStep(), constraint());
    card.setVisible(true);

    expect(card.element.textContent).toContain("P-0001");
    // Status chip
    expect(card.element.querySelector(".chip--pending")).not.toBeNull();
    // Deviation chip (3.2mm rounded)
    expect(card.element.textContent).toMatch(/Δ\s*3\.2mm/);
    // Tolerance chip
    expect(card.element.textContent).toMatch(/Tol ±2\.0mm/);
    // Directive body uses the formatter's installer language.
    expect(card.element.textContent).toContain("Status: pending");
  });

  it("renders slot-based directive when constraint declares features", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    const step = pendingStep();
    // Pure-X translation so the formatter matches the X-aligned slot.
    step.actions[0]!.delta!.translation_mm = [-3.0, 0, 0];
    step.computed_errors.translation_error_mm_vec = [-3.0, 0, 0];
    step.computed_errors.translation_error_norm_mm = 3.0;
    card.render(step, constraint());
    const body = card.element.querySelector(".directive-card__body");
    expect(body?.textContent ?? "").toContain("along slot S2");
  });

  it("disables Apply for steps already in tolerance", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(okStep(), constraint());
    const btn = card.element.querySelector(
      ".directive-card__apply",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Apply button invokes the onApply callback", () => {
    const onApply = vi.fn();
    const card = createDirectiveCard({ onApply });
    card.render(pendingStep(), constraint());
    const btn = card.element.querySelector(
      ".directive-card__apply",
    ) as HTMLButtonElement;
    btn.click();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("setVisible toggles display", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.setVisible(true);
    expect((card.element as HTMLElement).style.display).toBe("");
    card.setVisible(false);
    expect((card.element as HTMLElement).style.display).toBe("none");
  });
});
