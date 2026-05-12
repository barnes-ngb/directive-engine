/**
 * End-to-end overlay walkthrough — regression guard for Phase 9.
 *
 * Drives the beat controller through a synthetic overlay built from the
 * real `createBeatNav` and `createDirectiveCard` factories. Simulating real
 * DOM clicks is what catches the double-listener bug that the in-isolation
 * controller test cannot see.
 */

import { describe, expect, it, vi } from "vitest";
import type { PartConstraint, Status, Step } from "../../core/types.js";
import { BeatController } from "../beat-controller.js";
import { createBeatNav } from "../overlay/beat-nav.js";
import { createDirectiveCard } from "../overlay/directive-card.js";

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    step_id: "S1",
    part_id: "P-0005",
    status: "pending",
    reason_codes: ["translation_out_of_tolerance"],
    pose_confidence: 0.95,
    computed_errors: {
      translation_error_mm_vec: [-6.0, 2.0, 0.5],
      translation_error_norm_mm: 6.6,
      rotation_error_deg: 0,
    },
    actions: [
      {
        action_id: "A1",
        type: "translate",
        description: "Translate part",
        delta: { translation_mm: [-6.0, 2.0, 0.5], rotation_quat_xyzw: [0, 0, 0, 1] },
      },
    ],
    verification: [
      {
        verification_id: "V1",
        type: "measure_pose",
        acceptance: { translation_mm: 2.0, rotation_deg: 1.0 },
        expected_residual: { translation_mm_vec: [0.4, 0.2, 0.4], rotation_deg: 0 },
        expected_result: "expected_pass",
      },
    ],
    ...overrides,
  };
}

function makeConstraint(): PartConstraint {
  return {
    part_id: "P-0005",
    allowed_translation_axes: { x: true, y: true, z: true },
    rotation_mode: "fixed",
    allowed_rotation_axes: { x: false, y: false, z: false },
    tolerances: { translation_mm: 2.0, rotation_deg: 1.0 },
  };
}

function mountNav(controller: BeatController) {
  const onApply = vi.fn(() => {
    controller.goto(4);
  });
  const onRestart = vi.fn(() => {
    controller.reset();
  });
  const nav = createBeatNav({
    onBack: () => controller.prev(),
    onContinue: () => controller.next(),
    onApply,
    onRestart,
  });
  document.body.appendChild(nav.element);
  controller.on((current) => nav.render(current.beat));
  nav.render(controller.current.beat);
  const forwardBtn = nav.element.querySelector(
    ".de-beat-nav__button--primary",
  ) as HTMLButtonElement;
  const backBtn = nav.element.querySelector(
    ".de-beat-nav__button:not(.de-beat-nav__button--primary)",
  ) as HTMLButtonElement;
  return { nav, forwardBtn, backBtn, onApply, onRestart };
}

describe("full walkthrough", () => {
  it("walks 1 → 2 → 3 → 4 → 5 with one Continue click per beat", () => {
    const controller = new BeatController({ focusedPartId: "P-0005" });
    const { forwardBtn } = mountNav(controller);

    expect(controller.current.beat).toBe(1);

    forwardBtn.click();
    expect(controller.current.beat).toBe(2); // regression guard — must NOT be 3

    forwardBtn.click();
    expect(controller.current.beat).toBe(3);

    // Beat 3's forward button is "Apply" — invokes onApply which goto(4).
    forwardBtn.click();
    expect(controller.current.beat).toBe(4);

    forwardBtn.click();
    expect(controller.current.beat).toBe(5);
  });

  it("Back from each beat returns to the previous beat", () => {
    const controller = new BeatController({
      focusedPartId: "P-0005",
      initialBeat: 5,
    });
    const { backBtn } = mountNav(controller);

    backBtn.click();
    expect(controller.current.beat).toBe(4);
    backBtn.click();
    expect(controller.current.beat).toBe(3);
    backBtn.click();
    expect(controller.current.beat).toBe(2);
    backBtn.click();
    expect(controller.current.beat).toBe(1);
  });

  it("Restart at beat 5 returns to beat 1", () => {
    const controller = new BeatController({
      focusedPartId: "P-0005",
      initialBeat: 5,
    });
    const { forwardBtn, onRestart } = mountNav(controller);
    forwardBtn.click();
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(controller.current.beat).toBe(1);
  });

  it("a single Continue click advances exactly one beat (no double-fire)", () => {
    // This is the core regression guard for the Phase 9 Beat 2 skip bug:
    // earlier the forward button had two click handlers and a single click
    // advanced the controller twice.
    const controller = new BeatController({ focusedPartId: "P-0005" });
    const { forwardBtn } = mountNav(controller);
    const listener = vi.fn();
    controller.on(listener);
    forwardBtn.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("directive card shows pre-apply state when applied=false", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(makeStep(), makeConstraint(), false);
    expect(card.element.querySelector(".chip--pending")).not.toBeNull();
    expect(card.element.querySelector(".chip--ok")).toBeNull();
    expect(card.element.textContent).toMatch(/Δ\s*6\.6mm/);
  });

  it("directive card flips to ok chip and post-apply residual when applied=true", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(makeStep(), makeConstraint(), true);
    expect(card.element.querySelector(".chip--ok")).not.toBeNull();
    expect(card.element.querySelector(".chip--pending")).toBeNull();
    // Residual norm of [0.4, 0.2, 0.4] ≈ 0.6mm.
    expect(card.element.textContent).toMatch(/Δ\s*0\.6mm/);
    expect(card.element.textContent).not.toMatch(/Δ\s*6\.6mm/);
    const applyBtn = card.element.querySelector(
      ".directive-card__apply",
    ) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.textContent).toBe("Applied");
  });

  it("directive card tolerance chip stays the same in both modes", () => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(makeStep(), makeConstraint(), false);
    expect(card.element.textContent).toMatch(/Tol ±2\.0mm/);
    card.render(makeStep(), makeConstraint(), true);
    expect(card.element.textContent).toMatch(/Tol ±2\.0mm/);
  });

  it.each<[Status, string]>([
    ["pending", "chip--pending"],
    ["clamped", "chip--clamped"],
  ])("applied=true overrides %s status to ok", (status, baseChipClass) => {
    const card = createDirectiveCard({ onApply: vi.fn() });
    card.render(makeStep({ status }), makeConstraint(), true);
    expect(card.element.querySelector(`.${baseChipClass}`)).toBeNull();
    expect(card.element.querySelector(".chip--ok")).not.toBeNull();
  });
});
