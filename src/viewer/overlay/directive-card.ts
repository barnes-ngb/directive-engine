/**
 * Directive card: renders one engine-emitted Step as an installer-language
 * directive, plus an Apply button. Uses the site CSS class names
 * `directive-card` and `chip` so styling is consistent with the portfolio.
 */

import type { PartConstraint, Status, Step } from "../../core/types.js";
import { formatDirective } from "../../presentation/format-directive.js";

export interface DirectiveCardOptions {
  /** Called when the user clicks Apply. */
  onApply: () => void;
}

export interface DirectiveCardHandle {
  /** Root DOM element. */
  element: HTMLElement;
  /** Populate the card from a Step + its constraint. */
  render(step: Step, constraint: PartConstraint | undefined): void;
  /** Update visibility (true to show, false to hide). */
  setVisible(visible: boolean): void;
  /** Enable/disable the Apply button. */
  setApplyEnabled(enabled: boolean): void;
}

/** Build the directive-card root element + behaviour. */
export function createDirectiveCard(opts: DirectiveCardOptions): DirectiveCardHandle {
  const root = document.createElement("div");
  root.className = "directive-card";
  root.style.display = "none";

  const eyebrow = document.createElement("p");
  eyebrow.className = "directive-card__eyebrow";
  eyebrow.textContent = "Directive";
  root.appendChild(eyebrow);

  const partLabel = document.createElement("p");
  partLabel.className = "directive-card__part";
  partLabel.textContent = "—";
  root.appendChild(partLabel);

  const body = document.createElement("p");
  body.className = "directive-card__body";
  root.appendChild(body);

  const chips = document.createElement("div");
  chips.className = "directive-card__chips";
  root.appendChild(chips);

  const actions = document.createElement("div");
  actions.className = "directive-card__actions";
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "directive-card__apply";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", () => {
    opts.onApply();
  });
  actions.appendChild(applyBtn);
  root.appendChild(actions);

  function render(step: Step, constraint: PartConstraint | undefined): void {
    partLabel.textContent = step.part_id;
    body.textContent = formatDirective(step, constraint);

    chips.replaceChildren();
    chips.appendChild(buildStatusChip(step.status));
    if (typeof step.computed_errors.translation_error_norm_mm === "number") {
      const dev = step.computed_errors.translation_error_norm_mm;
      chips.appendChild(buildInfoChip(`Δ ${dev.toFixed(1)}mm`));
    }
    if (constraint) {
      chips.appendChild(
        buildInfoChip(`Tol ±${constraint.tolerances.translation_mm.toFixed(1)}mm`),
      );
    }

    // Disable Apply for non-correctable states.
    const correctable = step.status === "pending" || step.status === "clamped";
    applyBtn.disabled = !correctable;
    applyBtn.textContent = step.status === "ok" ? "Already in tolerance" : "Apply";
  }

  function setVisible(visible: boolean): void {
    root.style.display = visible ? "" : "none";
  }

  function setApplyEnabled(enabled: boolean): void {
    applyBtn.disabled = !enabled;
  }

  return { element: root, render, setVisible, setApplyEnabled };
}

function buildStatusChip(status: Status): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `chip chip--${status === "ok" ? "ok" : status}`;
  chip.textContent = status.replace("_", " ");
  return chip;
}

function buildInfoChip(label: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = label;
  return chip;
}
