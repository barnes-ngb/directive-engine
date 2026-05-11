/**
 * Text-only fallback view for the directive-engine demo.
 *
 * Activated via the "Text summary" corner link. Used by:
 *   - keyboard / screen-reader users who don't want to navigate the canvas
 *   - low-power devices where Three.js is sluggish
 *   - share previews where the OG image is more meaningful than the live scene
 *
 * The static content mirrors the 5-beat narrative (see docs/demo-script.md)
 * and surfaces the actual generated directive and before/after metrics so the
 * page is informative without rendering the 3D walk.
 */

import type { PartConstraint, Step } from "../../core/types.js";
import { formatDirective } from "../../presentation/format-directive.js";

export interface FallbackContent {
  /** Generated directives — only the focused part's is rendered in detail. */
  focusedStep: Step | undefined;
  focusedConstraint: PartConstraint | undefined;
  beforeMaxDeviationMm: number;
  afterMaxDeviationMm: number;
  toleranceMm: number;
}

export interface FallbackHandle {
  link: HTMLElement;
  panel: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
  dispose(): void;
}

const CLOSING_COPY =
  "This demo runs the v0.1 contract on toy_facade_v1. Same primitives drive " +
  "larger installs — see the SurveyLink case study for adjacent " +
  "aerospace-flavored work.";

export function createFallbackView(content: FallbackContent): FallbackHandle {
  const link = document.createElement("a");
  link.className = "de-fallback-link";
  link.href = "#text-summary";
  link.textContent = "Text summary";
  link.setAttribute("aria-haspopup", "dialog");
  link.setAttribute("aria-controls", "de-fallback-panel");

  const panel = document.createElement("div");
  panel.className = "de-fallback";
  panel.id = "de-fallback-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "de-fallback-title");

  const inner = document.createElement("div");
  inner.className = "de-fallback__inner";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "de-fallback__close";
  closeBtn.textContent = "Close ✕";
  closeBtn.setAttribute("aria-label", "Close text summary and return to 3D demo");
  inner.appendChild(closeBtn);

  const title = document.createElement("h1");
  title.id = "de-fallback-title";
  title.textContent = "Directive Engine — text summary";
  inner.appendChild(title);

  const lede = document.createElement("p");
  lede.className = "de-fallback__lede";
  lede.textContent =
    "Reality capture flags panels installed off-nominal. The engine maps " +
    "each deviation to the part's actual kinematic constraints and emits " +
    "an installer-ready directive, then verifies closure.";
  inner.appendChild(lede);

  // Five-beat narrative.
  const beatsHeader = document.createElement("h2");
  beatsHeader.textContent = "Walkthrough";
  inner.appendChild(beatsHeader);

  const beats = document.createElement("ol");
  beats.className = "de-fallback__beats";
  for (const [label, body] of BEAT_COPY) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = label;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(body));
    beats.appendChild(li);
  }
  inner.appendChild(beats);

  // Directive section — only render if we have one.
  if (content.focusedStep) {
    const directiveHeader = document.createElement("h2");
    directiveHeader.textContent = `Directive: ${content.focusedStep.part_id}`;
    inner.appendChild(directiveHeader);

    const directiveBody = document.createElement("p");
    directiveBody.textContent = formatDirective(
      content.focusedStep,
      content.focusedConstraint,
    );
    inner.appendChild(directiveBody);
  }

  // Verification metrics.
  const verifyHeader = document.createElement("h2");
  verifyHeader.textContent = "Verification";
  inner.appendChild(verifyHeader);

  const metricsGrid = document.createElement("div");
  metricsGrid.className = "de-fallback__metrics";
  metricsGrid.appendChild(
    buildMetric("Before (max)", `${content.beforeMaxDeviationMm.toFixed(1)} mm`),
  );
  metricsGrid.appendChild(
    buildMetric("After (max)", `${content.afterMaxDeviationMm.toFixed(1)} mm`),
  );
  metricsGrid.appendChild(
    buildMetric("Tolerance", `± ${content.toleranceMm.toFixed(1)} mm`),
  );
  const passed =
    content.afterMaxDeviationMm <= content.toleranceMm &&
    content.beforeMaxDeviationMm > content.toleranceMm;
  metricsGrid.appendChild(buildMetric("Status", passed ? "pass" : "review"));
  inner.appendChild(metricsGrid);

  const closing = document.createElement("p");
  closing.className = "callout";
  closing.style.marginTop = "24px";
  closing.textContent = CLOSING_COPY;
  inner.appendChild(closing);

  panel.appendChild(inner);

  let lastFocused: HTMLElement | null = null;

  function open(): void {
    if (!panel.hidden) return;
    lastFocused = document.activeElement as HTMLElement | null;
    panel.hidden = false;
    closeBtn.focus();
  }

  function close(): void {
    if (panel.hidden) return;
    panel.hidden = true;
    lastFocused?.focus?.();
  }

  function onLinkClick(e: Event): void {
    e.preventDefault();
    open();
  }

  function onCloseClick(): void {
    close();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (panel.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  link.addEventListener("click", onLinkClick);
  closeBtn.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeydown);

  return {
    link,
    panel,
    isOpen: () => !panel.hidden,
    open,
    close,
    dispose() {
      link.removeEventListener("click", onLinkClick);
      closeBtn.removeEventListener("click", onCloseClick);
      document.removeEventListener("keydown", onKeydown);
    },
  };
}

function buildMetric(label: string, value: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "metric-card";
  const labelEl = document.createElement("p");
  labelEl.className = "metric-card__label";
  labelEl.textContent = label;
  card.appendChild(labelEl);
  const valueEl = document.createElement("p");
  valueEl.className = "metric-card__value";
  valueEl.textContent = value;
  card.appendChild(valueEl);
  return card;
}

const BEAT_COPY: Array<[string, string]> = [
  [
    "1. Detection.",
    " Reality capture finds panels installed off-nominal. Severe deviations" +
      " are highlighted; the rest are within tolerance.",
  ],
  [
    "2. Constraint.",
    " Each part has named kinematic features — pivots (joints), slots, and" +
      " indexed bolt patterns — that bound what motion is permitted.",
  ],
  [
    "3. Directive.",
    " The engine emits a directive in installer language: pivot N degrees" +
      " about joint J, translate N mm along slot S, with status and" +
      " tolerance.",
  ],
  [
    "4. Apply.",
    " The installer executes the directive. The panel moves to within" +
      " tolerance.",
  ],
  [
    "5. Verify.",
    " Before/after deviation metrics close the loop. A pass chip confirms" +
      " the residual is inside the acceptance band.",
  ],
];
