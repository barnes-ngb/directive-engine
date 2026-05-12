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
  /**
   * Populate the card from a Step + its constraint. When `applied` is true,
   * the status chip flips to `ok`, the deviation chip shows the post-apply
   * residual (from `verification[0].expected_residual`), and the Apply
   * button disables — Beat 4's view of the same directive after correction.
   */
  render(
    step: Step,
    constraint: PartConstraint | undefined,
    applied?: boolean,
  ): void;
  /** Update visibility (true to show, false to hide). */
  setVisible(visible: boolean): void;
  /** Enable/disable the Apply button. */
  setApplyEnabled(enabled: boolean): void;
}

/** Build the directive-card root element + behaviour. */
export function createDirectiveCard(opts: DirectiveCardOptions): DirectiveCardHandle {
  const root = document.createElement("section");
  root.className = "directive-card";
  root.style.display = "none";
  root.setAttribute("aria-labelledby", "de-directive-eyebrow");

  const eyebrow = document.createElement("p");
  eyebrow.className = "directive-card__eyebrow";
  eyebrow.id = "de-directive-eyebrow";
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

  function render(
    step: Step,
    constraint: PartConstraint | undefined,
    applied = false,
  ): void {
    partLabel.textContent = step.part_id;
    body.textContent = formatDirective(step, constraint);

    chips.replaceChildren();
    const deviation = applied
      ? residualNorm(step)
      : step.computed_errors.translation_error_norm_mm;
    const status: Status = applied ? "ok" : step.status;

    chips.appendChild(buildStatusChip(status));
    if (typeof deviation === "number") {
      chips.appendChild(buildInfoChip(`Δ ${deviation.toFixed(1)}mm`));
    }
    if (constraint) {
      chips.appendChild(
        buildInfoChip(`Tol ±${constraint.tolerances.translation_mm.toFixed(1)}mm`),
      );
    }

    const correctable = step.status === "pending" || step.status === "clamped";
    if (applied) {
      applyBtn.disabled = true;
      applyBtn.textContent = "Applied";
    } else {
      applyBtn.disabled = !correctable;
      applyBtn.textContent = step.status === "ok" ? "Already in tolerance" : "Apply";
    }
  }

  function residualNorm(step: Step): number {
    const vec = step.verification[0]?.expected_residual.translation_mm_vec;
    if (!vec) return 0;
    return Math.hypot(vec[0], vec[1], vec[2]);
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
  const label = status.replace("_", " ");
  chip.textContent = label;
  // The label itself communicates state — but make it explicit for AT.
  chip.setAttribute("role", "status");
  chip.setAttribute("aria-label", `Status: ${label}`);
  return chip;
}

function buildInfoChip(label: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = label;
  return chip;
}
