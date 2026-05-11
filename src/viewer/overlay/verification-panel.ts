/**
 * Verification panel: shown at beat 5. Renders a before/after deviation
 * metric using `metric-card` primitives, a pass chip, and the closing copy
 * line bridging to the SurveyLink case study.
 */

const CLOSING_COPY =
  "This demo runs the v0.1 contract on toy_facade_v1. " +
  "Same primitives drive larger installs — see the SurveyLink case study " +
  "for adjacent aerospace-flavored work.";

export interface VerificationMetrics {
  beforeMaxDeviationMm: number;
  afterMaxDeviationMm: number;
  toleranceMm: number;
}

export interface VerificationPanelHandle {
  element: HTMLElement;
  render(metrics: VerificationMetrics): void;
  setVisible(visible: boolean): void;
}

export function createVerificationPanel(): VerificationPanelHandle {
  const root = document.createElement("section");
  root.className = "verification-panel";
  root.style.display = "none";
  root.setAttribute("aria-labelledby", "de-verify-eyebrow");

  const eyebrow = document.createElement("p");
  eyebrow.className = "verification-panel__eyebrow";
  eyebrow.id = "de-verify-eyebrow";
  eyebrow.textContent = "Verification";
  root.appendChild(eyebrow);

  const metricsRow = document.createElement("div");
  metricsRow.className = "verification-panel__metrics";

  const beforeCard = buildMetricCard("Before", "—");
  const afterCard = buildMetricCard("After", "—");
  metricsRow.appendChild(beforeCard.element);
  metricsRow.appendChild(afterCard.element);
  root.appendChild(metricsRow);

  const chipRow = document.createElement("div");
  chipRow.className = "directive-card__chips";
  const passChip = document.createElement("span");
  passChip.className = "chip chip--pass";
  passChip.textContent = "pass";
  passChip.setAttribute("role", "status");
  passChip.setAttribute("aria-label", "Verification status: pass");
  chipRow.appendChild(passChip);
  root.appendChild(chipRow);

  const callout = document.createElement("p");
  callout.className = "callout verification-panel__callout";
  callout.textContent = CLOSING_COPY;
  root.appendChild(callout);

  function render(metrics: VerificationMetrics): void {
    beforeCard.setValue(metrics.beforeMaxDeviationMm.toFixed(1), "mm max");
    afterCard.setValue(metrics.afterMaxDeviationMm.toFixed(1), "mm max");
    const passed =
      metrics.afterMaxDeviationMm <= metrics.toleranceMm &&
      metrics.beforeMaxDeviationMm > metrics.toleranceMm;
    passChip.className = passed ? "chip chip--pass" : "chip chip--pending";
    passChip.textContent = passed ? "pass" : "review";
    passChip.setAttribute(
      "aria-label",
      `Verification status: ${passed ? "pass" : "review"}`,
    );
  }

  function setVisible(visible: boolean): void {
    root.style.display = visible ? "" : "none";
  }

  return { element: root, render, setVisible };
}

interface MetricCard {
  element: HTMLElement;
  setValue(value: string, unit: string): void;
}

function buildMetricCard(label: string, initial: string): MetricCard {
  const card = document.createElement("div");
  card.className = "metric-card";

  const labelEl = document.createElement("p");
  labelEl.className = "metric-card__label";
  labelEl.textContent = label;
  card.appendChild(labelEl);

  const valueEl = document.createElement("p");
  valueEl.className = "metric-card__value";
  valueEl.textContent = initial;
  card.appendChild(valueEl);

  return {
    element: card,
    setValue(value: string, unit: string) {
      valueEl.textContent = "";
      valueEl.appendChild(document.createTextNode(value));
      const unitSpan = document.createElement("span");
      unitSpan.className = "metric-card__unit";
      unitSpan.textContent = ` ${unit}`;
      valueEl.appendChild(unitSpan);
    },
  };
}
