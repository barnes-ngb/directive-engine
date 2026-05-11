/**
 * Overlay container: composes the headline, directive card, verification
 * panel, and beat-nav into a single DOM tree, and reflects the current
 * beat onto each child. Owns the wiring from BeatController to the DOM.
 */

import type { Step, PartConstraint } from "../../core/types.js";
import { type Beat, BeatController } from "../beat-controller.js";
import type { EngineBundle } from "../engine-bridge.js";
import { createDirectiveCard, type DirectiveCardHandle } from "./directive-card.js";
import { createHeadline, type HeadlineHandle } from "./headline.js";
import {
  createVerificationPanel,
  type VerificationPanelHandle,
} from "./verification-panel.js";
import { createBeatNav, type BeatNavHandle } from "./beat-nav.js";

export interface OverlayHandle {
  element: HTMLElement;
  /** Detach DOM listeners; the caller removes the element. */
  dispose(): void;
}

export interface OverlayOptions {
  host: HTMLElement;
  controller: BeatController;
  bundle: EngineBundle;
  /**
   * Called when the user applies the directive at beat 3 (single-button UX
   * — Apply also advances to beat 4). The owner uses this to trigger the
   * scene snap.
   */
  onApply: () => void;
  /** Called when the user resets to beat 1. */
  onRestart: () => void;
}

export function mountOverlay(opts: OverlayOptions): OverlayHandle {
  const root = document.createElement("div");
  root.className = "de-overlay";

  const headline = createHeadline();
  const card = createDirectiveCard({
    onApply: () => triggerApply(),
  });
  const verification = createVerificationPanel();
  const nav = createBeatNav({
    onBack: () => opts.controller.prev(),
    onContinue: () => opts.controller.next(),
    onApply: () => triggerApply(),
    onRestart: () => triggerRestart(),
  });

  root.appendChild(headline.element);
  root.appendChild(card.element);
  root.appendChild(verification.element);
  root.appendChild(nav.element);
  opts.host.appendChild(root);

  function triggerApply(): void {
    opts.onApply();
    opts.controller.goto(4);
  }

  function triggerRestart(): void {
    opts.onRestart();
    opts.controller.reset();
  }

  function update(beat: Beat): void {
    headline.render(beat);
    nav.render(beat);
    updateDirectiveCard(beat, card, opts);
    updateVerificationPanel(beat, verification, opts);
  }

  const unsubscribe = opts.controller.on((current) => {
    update(current.beat);
  });
  update(opts.controller.current.beat);

  return {
    element: root,
    dispose() {
      unsubscribe();
    },
  };
}

function updateDirectiveCard(
  beat: Beat,
  card: DirectiveCardHandle,
  opts: OverlayOptions,
): void {
  const show = beat === 3 || beat === 4;
  card.setVisible(show);
  if (!show) return;
  const partId = opts.controller.current.focusedPartId;
  if (!partId) return;
  const step = opts.bundle.stepByPartId.get(partId);
  const constraint = opts.bundle.constraintById.get(partId);
  if (step) card.render(step, constraint);
  // Disable Apply once we've already advanced past beat 3.
  card.setApplyEnabled(beat === 3 && isCorrectable(step));
}

function isCorrectable(step: Step | undefined): boolean {
  if (!step) return false;
  return step.status === "pending" || step.status === "clamped";
}

function updateVerificationPanel(
  beat: Beat,
  panel: VerificationPanelHandle,
  opts: OverlayOptions,
): void {
  const show = beat === 5;
  panel.setVisible(show);
  if (!show) return;
  const tolerance = pickTolerance(opts.bundle);
  panel.render({
    beforeMaxDeviationMm: opts.bundle.beforeMaxDeviationMm,
    afterMaxDeviationMm: opts.bundle.afterMaxDeviationMm,
    toleranceMm: tolerance,
  });
}

function pickTolerance(bundle: EngineBundle): number {
  // Use the focused part's tolerance if available, else the first constraint.
  const first = bundle.constraints.parts[0];
  return first?.tolerances.translation_mm ?? 2.0;
}

export type { Step, PartConstraint };
