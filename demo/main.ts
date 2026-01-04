import { computeRigidTransform, generateDirectives, simulateStep } from "../src/core/index.js";
import { identity, multiply, toAxisAngle } from "../src/core/math/quat.js";
import { add } from "../src/core/math/vec.js";
import type { SimulationResult } from "../src/core/index.js";
import type {
  Action,
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  Status,
  Vec3
} from "../src/types.js";
import {
  describeAction,
  deriveOverallStatus,
  extractPartSummaries,
  formatResidual,
  STATUS_PRIORITY
} from "./summary.js";
import {
  DatasetFetchError,
  convertMuseumRawToPoseDatasets,
  loadMuseumDataset,
  normalizeMuseumAnchors
} from "./museum.js";
import {
  downloadDirectivesJson,
  downloadRunSummaryMd,
  downloadDirectivesCsv,
  printView,
  type ExportContext
} from "./export.js";

type DatasetPaths = {
  nominal: string;
  asBuilt: string;
  constraints: string;
};

type DemoDataset = "toy" | "museum";


const statusPriority: Status[] = STATUS_PRIORITY;
const statusClasses = new Set(statusPriority);

const runButton = document.querySelector<HTMLButtonElement>(".run-button");
const datasetSelect = document.querySelector<HTMLSelectElement>("#dataset-select");
const statusBadge = document.querySelector<HTMLSpanElement>("#status-badge");
const statusDetails = document.querySelector<HTMLDivElement>("#status-details");
const partList = document.querySelector<HTMLDivElement>("#part-list");
const actionList = document.querySelector<HTMLDivElement>("#action-list");
const verificationResidual = document.querySelector<HTMLDivElement>("#verification-residual");
const alignmentPanel = document.querySelector<HTMLElement>("#alignment-panel");
const alignmentRms = document.querySelector<HTMLSpanElement>("#alignment-rms");
const alignmentResiduals = document.querySelector<HTMLTableSectionElement>("#alignment-residuals");
const rawJson = document.querySelector<HTMLPreElement>("#raw-json");
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner");
const constraintsPanel = document.querySelector<HTMLDivElement>("#constraints-panel");
const simulationPanel = document.querySelector<HTMLDivElement>("#simulation-panel");
const exportJsonButton = document.querySelector<HTMLButtonElement>("#export-json");
const exportSummaryButton = document.querySelector<HTMLButtonElement>("#export-summary");
const exportCsvButton = document.querySelector<HTMLButtonElement>("#export-csv");
const exportPrintButton = document.querySelector<HTMLButtonElement>("#export-print");

let cachedDirectives: DirectivesOutput | null = null;
let cachedNominal: NominalPosesDataset | null = null;
let cachedAsBuilt: AsBuiltPosesDataset | null = null;
let cachedConstraints: ConstraintsDataset | null = null;
let cachedAlignment: ReturnType<typeof computeRigidTransform> | null = null;
let cachedSummaries: ReturnType<typeof extractPartSummaries> | null = null;
let selectedPartId: string | null = null;
let selectedDataset: DemoDataset = datasetSelect?.value === "museum" ? "museum" : "toy";
const cachedSimulationResults = new Map<string, SimulationResult>();

function formatVec(vec?: [number, number, number], digits = 2): string {
  if (!vec) return "n/a";
  return `[${vec.map((value) => formatResidual(value, digits)).join(", ")}]`;
}

function computeDirectiveDelta(actions: Action[]): { translation_mm_vec: Vec3; rotation_deg: number } | null {
  let combinedTranslation: Vec3 = [0, 0, 0];
  let combinedRotation = identity();
  let hasDelta = false;

  for (const action of actions) {
    if (!action.delta) continue;
    hasDelta = true;
    combinedTranslation = add(combinedTranslation, action.delta.translation_mm);
    combinedRotation = multiply(action.delta.rotation_quat_xyzw, combinedRotation);
  }

  if (!hasDelta) return null;

  const { angleDeg } = toAxisAngle(combinedRotation);
  return {
    translation_mm_vec: combinedTranslation,
    rotation_deg: angleDeg
  };
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function formatReasonCodes(reasonCodes: string[]): string {
  if (!reasonCodes || reasonCodes.length === 0) return "";
  return reasonCodes.map((code) => code.replace(/_/g, " ")).join(", ");
}

function formatToleranceComparison(value: number | null, tolerance: number, unit: string): string {
  return `${formatResidual(value)} ${unit} (tol ${formatResidual(tolerance)} ${unit})`;
}

function withinTolerances(
  translationNorm: number | null,
  rotationDeg: number | null,
  tolerances: { translation_mm: number; rotation_deg: number }
): boolean {
  if (translationNorm === null || rotationDeg === null) return false;
  return (
    translationNorm <= tolerances.translation_mm + 1e-12 &&
    rotationDeg <= tolerances.rotation_deg + 1e-12
  );
}

function setError(message: string | null) {
  if (!errorBanner) return;
  if (message) {
    errorBanner.hidden = false;
    errorBanner.textContent = message;
  } else {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
  }
}

function setStatusBadge(status: string, statusClass?: Status) {
  if (!statusBadge) return;
  statusBadge.textContent = status;
  statusBadge.classList.remove(...Array.from(statusClasses));
  if (statusClass) {
    statusBadge.classList.add(statusClass);
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function runGenerateDirectives(
  nominal: NominalPosesDataset,
  asBuilt: AsBuiltPosesDataset,
  constraints: ConstraintsDataset,
  paths: DatasetPaths
): Promise<DirectivesOutput> {
  const engine = generateDirectives as unknown as (...args: unknown[]) => unknown;
  try {
    const positionalResult = engine(nominal, asBuilt, constraints, {
      inputPaths: {
        nominal: paths.nominal,
        asBuilt: paths.asBuilt,
        constraints: paths.constraints
      }
    });
    return await Promise.resolve(positionalResult as DirectivesOutput);
  } catch (error) {
    const objectResult = engine({
      nominal,
      asBuilt,
      constraints,
      options: {
        inputPaths: {
          nominal: paths.nominal,
          asBuilt: paths.asBuilt,
          constraints: paths.constraints
        }
      }
    });
    return await Promise.resolve(objectResult as DirectivesOutput);
  }
}

function renderParts(
  parts: ReturnType<typeof extractPartSummaries>,
  partNames: Map<string, string>
) {
  if (!partList) return;

  if (parts.length === 0) {
    partList.innerHTML = `<p class="placeholder">No parts available.</p>`;
    return;
  }

  partList.innerHTML = `
    <ul class="part-list">
      ${parts
        .map((part) => {
          const name = partNames.get(part.id) ?? part.id;
          const isSelected = part.id === selectedPartId;
          return `
            <li>
              <button class="part-button ${isSelected ? "is-selected" : ""}" type="button" data-part-id="${part.id}">
                <span class="part-meta">
                  <strong>${name}</strong>
                  <span>Part ${part.id}</span>
                </span>
                <span class="badge ${part.status}">${formatStatusLabel(part.status)}</span>
              </button>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;

  partList.querySelectorAll<HTMLButtonElement>(".part-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPartId = button.dataset.partId ?? null;
      renderSelection();
      renderParts(steps, partNames);
    });
  });
}

function renderStatus(directives: DirectivesOutput, asBuilt: AsBuiltPosesDataset) {
  if (!statusDetails) return;

  const counts = directives.summary?.counts_by_status;
  const countsMarkup = counts
    ? `<ul>${statusPriority
        .map((status) => `<li>${formatStatusLabel(status)}: ${counts[status]}</li>`)
        .join("")}</ul>`
    : "";

  statusDetails.innerHTML = `
    <div class="status-details">
      <div><strong>Dataset:</strong> ${directives.dataset_id}</div>
      <div><strong>Measured at:</strong> ${asBuilt.measured_at}</div>
      <div><strong>Generated at:</strong> ${directives.generated_at}</div>
      <div><strong>Engine:</strong> ${directives.engine_version}</div>
      ${countsMarkup}
    </div>
  `;
}

function renderSelection() {
  if (!cachedDirectives || !cachedNominal || !cachedSummaries) return;
  const steps = cachedDirectives.steps;
  if (!actionList || !verificationResidual) return;

  const selectedSummary = selectedPartId
    ? cachedSummaries.find((summary) => summary.id === selectedPartId)
    : cachedSummaries[0];

  if (!selectedSummary) {
    actionList.innerHTML = `<p class="placeholder">Select a part to see actions.</p>`;
    verificationResidual.innerHTML = `<p class="placeholder">Select a part to see expected residual.</p>`;
    return;
  }

  selectedPartId = selectedSummary.id;

  if (selectedSummary.actions.length === 0) {
    actionList.innerHTML = `<p class="placeholder">No actions for this part.</p>`;
  } else {
    actionList.innerHTML = `
      <div class="action-list">
        ${selectedSummary.actions
          .map((action) => {
            return `
              <div class="action-card">
                <h3>${action.type}</h3>
                <p>${describeAction(action)}</p>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  const expected = selectedSummary.expectedResidual;
  const selectedStep = steps.find((step) => step.part_id === selectedSummary.id);
  verificationResidual.innerHTML = `
    <div class="residual-grid">
      <div><strong>Translation:</strong> ${formatVec(expected?.translation_mm_vec)} mm</div>
      <div><strong>Rotation:</strong> ${formatResidual(expected?.rotation_deg ?? null)}°</div>
      <div><strong>Expected result:</strong> ${selectedStep?.verification?.[0]?.expected_result ?? "n/a"}</div>
    </div>
  `;

  renderConstraints(selectedSummary.id);
  renderSimulation(selectedSummary.id);
}

function formatAxisMask(mask: { x: boolean; y: boolean; z: boolean }): string {
  const axes = [];
  if (mask.x) axes.push("X");
  if (mask.y) axes.push("Y");
  if (mask.z) axes.push("Z");
  return axes.length > 0 ? axes.join(", ") : "None";
}

function formatPerAxisLimit(limit?: { x: number; y: number; z: number }): string {
  if (!limit) return "n/a";
  return `X: ${limit.x}, Y: ${limit.y}, Z: ${limit.z}`;
}

function renderConstraints(partId: string) {
  if (!constraintsPanel || !cachedConstraints) {
    if (constraintsPanel) {
      constraintsPanel.innerHTML = `<p class="placeholder">Constraints not available.</p>`;
    }
    return;
  }

  const partConstraint = cachedConstraints.parts.find((p) => p.part_id === partId);
  if (!partConstraint) {
    constraintsPanel.innerHTML = `<p class="placeholder">No constraints for part ${partId}.</p>`;
    return;
  }

  const threshold = cachedConstraints.engine_config.confidence_threshold;

  // Build translation limits section
  let translationLimits = "";
  if (partConstraint.translation_max_abs_mm) {
    translationLimits += `<div><strong>Max per-axis (mm):</strong> ${formatPerAxisLimit(partConstraint.translation_max_abs_mm)}</div>`;
  }
  if (partConstraint.translation_max_norm_mm !== undefined) {
    translationLimits += `<div><strong>Max norm (mm):</strong> ${partConstraint.translation_max_norm_mm}</div>`;
  }

  // Build rotation section
  let rotationSection = `<div><strong>Mode:</strong> ${partConstraint.rotation_mode}</div>`;
  rotationSection += `<div><strong>Allowed axes:</strong> ${formatAxisMask(partConstraint.allowed_rotation_axes)}</div>`;

  if (partConstraint.rotation_max_abs_deg) {
    rotationSection += `<div><strong>Max (deg):</strong> ${formatPerAxisLimit(partConstraint.rotation_max_abs_deg)}</div>`;
  }

  // Index rotation details
  let indexSection = "";
  if (partConstraint.index_rotation) {
    const idx = partConstraint.index_rotation;
    indexSection = `
      <div class="constraints-subsection">
        <div class="constraints-label">Index Rotation</div>
        <div><strong>Axis:</strong> ${idx.axis.toUpperCase()}</div>
        <div><strong>Increment:</strong> ${idx.increment_deg}°</div>
        <div><strong>Allowed indices:</strong> [${idx.allowed_indices.join(", ")}]</div>
        <div><strong>Nominal index:</strong> ${idx.nominal_index}</div>
      </div>
    `;
  }

  constraintsPanel.innerHTML = `
    <div class="constraints-grid">
      <div class="constraints-section">
        <div class="constraints-label">Translation DOF</div>
        <div><strong>Allowed axes:</strong> ${formatAxisMask(partConstraint.allowed_translation_axes)}</div>
        ${translationLimits}
      </div>
      <div class="constraints-section">
        <div class="constraints-label">Rotation DOF</div>
        ${rotationSection}
      </div>
      ${indexSection}
      <div class="constraints-section">
        <div class="constraints-label">Tolerances</div>
        <div><strong>Translation:</strong> ${partConstraint.tolerances.translation_mm} mm</div>
        <div><strong>Rotation:</strong> ${partConstraint.tolerances.rotation_deg}°</div>
      </div>
      <div class="constraints-section">
        <div class="constraints-label">Global</div>
        <div><strong>Confidence threshold:</strong> ${threshold}</div>
      </div>
    </div>
  `;
}

function runSimulation(partId: string): SimulationResult | null {
  if (!cachedDirectives || !cachedNominal || !cachedAsBuilt || !cachedConstraints) {
    return null;
  }

  const step = cachedDirectives.steps.find((s) => s.part_id === partId);
  const nominalPart = cachedNominal.parts.find((p) => p.part_id === partId);
  const asBuiltPart = cachedAsBuilt.parts.find((p) => p.part_id === partId);
  const partConstraint = cachedConstraints.parts.find((p) => p.part_id === partId);

  if (!step || !nominalPart || !asBuiltPart || !partConstraint) {
    return null;
  }

  const result = simulateStep({
    nominalPose: nominalPart.T_world_part_nominal,
    asBuiltPose: asBuiltPart.T_world_part_asBuilt,
    step,
    tolerances: partConstraint.tolerances
  });

  cachedSimulationResults.set(partId, result);
  return result;
}

function renderSimulation(partId: string) {
  if (!simulationPanel) return;

  if (!cachedDirectives || !cachedConstraints) {
    simulationPanel.innerHTML = `<p class="placeholder">Select a part to simulate applying its directive.</p>`;
    return;
  }

  const step = cachedDirectives.steps.find((s) => s.part_id === partId);
  const partConstraint = cachedConstraints.parts.find((p) => p.part_id === partId);

  if (!step || !partConstraint) {
    simulationPanel.innerHTML = `<p class="placeholder">Part data not available.</p>`;
    return;
  }

  const canSimulate = step.status !== "blocked" && step.status !== "needs_review";
  const cachedResult = cachedSimulationResults.get(partId);
  const beforeError = cachedResult?.beforeError ?? {
    translation_mm_vec: step.computed_errors.translation_error_mm_vec,
    translation_norm_mm: step.computed_errors.translation_error_norm_mm,
    rotation_deg: step.computed_errors.rotation_error_deg
  };
  const beforePass = withinTolerances(
    beforeError.translation_norm_mm,
    beforeError.rotation_deg,
    partConstraint.tolerances
  );

  // Before Error display (always show from step computed_errors)
  const beforeErrorHtml = `
    <div class="simulation-section">
      <div class="simulation-label">Before Error</div>
      <div><strong>Translation:</strong> ${formatVec(beforeError.translation_mm_vec)} mm</div>
      <div><strong>Translation norm:</strong> ${formatToleranceComparison(
        beforeError.translation_norm_mm,
        partConstraint.tolerances.translation_mm,
        "mm"
      )}</div>
      <div><strong>Rotation:</strong> ${formatToleranceComparison(
        beforeError.rotation_deg,
        partConstraint.tolerances.rotation_deg,
        "°"
      )}</div>
      <div class="simulation-result is-inline">
        <span class="badge simulation-badge ${beforePass ? "pass" : "fail"}">
          ${beforePass ? "PASS" : "FAIL"}
        </span>
        <span class="simulation-tolerance">Current vs tolerance</span>
      </div>
    </div>
  `;

  // Directive Delta display
  let directiveDeltaHtml = "";
  const directiveDelta = cachedResult?.directiveDelta ?? computeDirectiveDelta(step.actions);
  if (directiveDelta) {
    directiveDeltaHtml = `
      <div class="simulation-section">
        <div class="simulation-label">Directive Delta</div>
        <div><strong>Translation:</strong> ${formatVec(directiveDelta.translation_mm_vec)} mm</div>
        ${directiveDelta.rotation_deg > 1e-6
          ? `<div><strong>Rotation:</strong> ${formatResidual(directiveDelta.rotation_deg)}°</div>`
          : ""
        }
      </div>
    `;
  } else if (step.actions.length > 0) {
    directiveDeltaHtml = `
      <div class="simulation-section">
        <div class="simulation-label">Directive Delta</div>
        <p class="placeholder">No directive delta available.</p>
      </div>
    `;
  }

  // Button and after error display
  let buttonHtml: string;
  let afterErrorHtml = `
    <div class="simulation-section">
      <div class="simulation-label">After Error</div>
      <div><strong>Translation:</strong> n/a</div>
      <div><strong>Translation norm:</strong> ${formatToleranceComparison(
        null,
        partConstraint.tolerances.translation_mm,
        "mm"
      )}</div>
      <div><strong>Rotation:</strong> ${formatToleranceComparison(
        null,
        partConstraint.tolerances.rotation_deg,
        "°"
      )}</div>
      <div class="simulation-result is-inline">
        <span class="badge simulation-badge pending">PENDING</span>
        <span class="simulation-tolerance">Simulate to evaluate</span>
      </div>
    </div>
  `;
  const resetButtons: string[] = [];

  if (cachedResult) {
    resetButtons.push(`
      <button class="reset-button" type="button" data-part-id="${partId}">
        Reset
      </button>
    `);
  }

  if (cachedSimulationResults.size > 0) {
    resetButtons.push(`
      <button class="reset-all-button" type="button">
        Reset All
      </button>
    `);
  }

  if (!canSimulate) {
    const statusLabel = formatStatusLabel(step.status);
    const reasonCodesText = formatReasonCodes(step.reason_codes);
    const reasonDetail = reasonCodesText ? `: ${reasonCodesText}` : "";
    buttonHtml = `
      <button class="simulate-button" type="button" disabled title="Cannot simulate: ${statusLabel}${reasonDetail}">
        N/A
      </button>
      <span class="simulate-note">Cannot simulate: ${statusLabel}</span>
      ${reasonCodesText ? `<span class="simulate-reason-codes">(${reasonCodesText})</span>` : ""}
    `;
    afterErrorHtml = `
      <div class="simulation-section">
        <div class="simulation-label">After Error</div>
        <div><strong>Translation:</strong> n/a</div>
        <div><strong>Translation norm:</strong> ${formatToleranceComparison(
          null,
          partConstraint.tolerances.translation_mm,
          "mm"
        )}</div>
        <div><strong>Rotation:</strong> ${formatToleranceComparison(
          null,
          partConstraint.tolerances.rotation_deg,
          "°"
        )}</div>
        <div class="simulation-result is-inline">
          <span class="badge simulation-badge pending">N/A</span>
          <span class="simulation-tolerance">Simulation unavailable</span>
        </div>
      </div>
    `;
  } else if (cachedResult) {
    // Show the cached result
    buttonHtml = `
      <button class="simulate-button simulated" type="button" data-part-id="${partId}">
        Re-simulate
      </button>
    `;
    afterErrorHtml = `
      <div class="simulation-section">
        <div class="simulation-label">After Error</div>
        <div><strong>Translation:</strong> ${formatVec(cachedResult.afterError.translation_mm_vec)} mm</div>
        <div><strong>Translation norm:</strong> ${formatToleranceComparison(
          cachedResult.afterError.translation_norm_mm,
          partConstraint.tolerances.translation_mm,
          "mm"
        )}</div>
        <div><strong>Rotation:</strong> ${formatToleranceComparison(
          cachedResult.afterError.rotation_deg,
          partConstraint.tolerances.rotation_deg,
          "°"
        )}</div>
        <div class="simulation-result is-inline">
          <span class="badge simulation-badge ${cachedResult.pass ? "pass" : "fail"}">
            ${cachedResult.pass ? "PASS" : "FAIL"}
          </span>
          <span class="simulation-tolerance">After vs tolerance</span>
        </div>
      </div>
    `;
  } else {
    buttonHtml = `
      <button class="simulate-button" type="button" data-part-id="${partId}">
        Simulate Apply
      </button>
    `;
  }

  simulationPanel.innerHTML = `
    <div class="simulation-grid">
      ${beforeErrorHtml}
      ${directiveDeltaHtml}
      <div class="simulation-actions">
        ${buttonHtml}
        ${resetButtons.join("")}
      </div>
      ${afterErrorHtml}
    </div>
  `;

  // Attach click handler for simulate button
  const simulateButton = simulationPanel.querySelector<HTMLButtonElement>(".simulate-button:not([disabled])");
  if (simulateButton) {
    simulateButton.addEventListener("click", () => {
      const id = simulateButton.dataset.partId;
      if (id) {
        runSimulation(id);
        renderSimulation(id);
      }
    });
  }

  // Attach click handler for reset button (single part)
  const resetButton = simulationPanel.querySelector<HTMLButtonElement>(".reset-button");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      const id = resetButton.dataset.partId;
      if (id) {
        cachedSimulationResults.delete(id);
        renderSimulation(id);
      }
    });
  }

  // Attach click handler for reset all button
  const resetAllButton = simulationPanel.querySelector<HTMLButtonElement>(".reset-all-button");
  if (resetAllButton) {
    resetAllButton.addEventListener("click", () => {
      cachedSimulationResults.clear();
      if (selectedPartId) {
        renderSimulation(selectedPartId);
      }
    });
  }
}

function renderRawJson(payload: unknown) {
  if (!rawJson) return;
  rawJson.textContent = JSON.stringify(payload, null, 2);
}

function renderAlignmentQuality(dataset: DemoDataset) {
  if (!alignmentPanel) return;

  if (dataset !== "museum") {
    alignmentPanel.hidden = true;
    if (alignmentRms) alignmentRms.textContent = "—";
    if (alignmentResiduals) {
      alignmentResiduals.innerHTML = `
        <tr>
          <td class="placeholder-cell" colspan="5">Residuals will appear here.</td>
        </tr>
      `;
    }
    return;
  }

  alignmentPanel.hidden = false;

  if (!cachedAlignment) {
    if (alignmentRms) alignmentRms.textContent = "n/a";
    if (alignmentResiduals) {
      alignmentResiduals.innerHTML = `
        <tr>
          <td class="placeholder-cell" colspan="5">Residuals unavailable.</td>
        </tr>
      `;
    }
    return;
  }

  const { rms_mm: rms, residuals_mm: residuals } = cachedAlignment;
  if (alignmentRms) alignmentRms.textContent = formatResidual(rms);

  if (!alignmentResiduals) return;
  if (residuals.length === 0) {
    alignmentResiduals.innerHTML = `
      <tr>
        <td class="placeholder-cell" colspan="5">No residuals available.</td>
      </tr>
    `;
    return;
  }

  const sortedResiduals = [...residuals].sort((a, b) => b.residual_mm - a.residual_mm);

  alignmentResiduals.innerHTML = sortedResiduals
    .map((entry) => {
      const [dx, dy, dz] = entry.residual_vec_mm ?? [null, null, null];
      return `
        <tr>
          <td>${entry.anchor_id}</td>
          <td class="numeric">${formatResidual(entry.residual_mm)}</td>
          <td class="numeric">${formatResidual(dx)}</td>
          <td class="numeric">${formatResidual(dy)}</td>
          <td class="numeric">${formatResidual(dz)}</td>
        </tr>
      `;
    })
    .join("");
}

function formatDatasetError(error: DatasetFetchError): string {
  const statusLabel =
    error.status !== undefined ? ` (status ${error.status}${error.statusText ? ` ${error.statusText}` : ""})` : "";
  const prefix = error.kind === "parse" ? "Invalid JSON in" : "Failed to load";
  const hint = `Place the file under demo/public so it is served at ${error.path}.`;
  return `${prefix} ${error.path}${statusLabel}. ${hint}`;
}

function getDatasetLabel(dataset: DemoDataset): string {
  return dataset === "museum" ? "Museum" : "Toy";
}

function resetResults(dataset: DemoDataset) {
  cachedDirectives = null;
  cachedNominal = null;
  cachedAsBuilt = null;
  cachedConstraints = null;
  cachedSummaries = null;
  selectedPartId = null;
  cachedSimulationResults.clear();
  setError(null);
  setStatusBadge("Idle");
  const label = getDatasetLabel(dataset);
  if (statusDetails) {
    statusDetails.innerHTML = `<p class="placeholder">Status details for the ${label} dataset will appear here.</p>`;
  }
  if (partList) {
    partList.innerHTML = `<p class="placeholder">Parts will appear here.</p>`;
  }
  if (actionList) {
    actionList.innerHTML = `<p class="placeholder">Actions will appear here.</p>`;
  }
  if (verificationResidual) {
    verificationResidual.innerHTML = `<p class="placeholder">Expected residual output will appear here.</p>`;
  }
  if (constraintsPanel) {
    constraintsPanel.innerHTML = `<p class="placeholder">Constraints will appear here.</p>`;
  }
  if (simulationPanel) {
    simulationPanel.innerHTML = `<p class="placeholder">Select a part to simulate applying its directive.</p>`;
  }
  if (rawJson) {
    rawJson.textContent = "";
  }
  updateExportButtons(false);
}

function updateExportButtons(enabled: boolean) {
  if (exportJsonButton) exportJsonButton.disabled = !enabled;
  if (exportSummaryButton) exportSummaryButton.disabled = !enabled;
  if (exportCsvButton) exportCsvButton.disabled = !enabled;
}

function getExportContext(): ExportContext | null {
  if (!cachedDirectives || !cachedConstraints) return null;
  return {
    directives: cachedDirectives,
    alignment: cachedAlignment,
    simulationResults: cachedSimulationResults,
    constraints: cachedConstraints
  };
}

function handleExportJson() {
  if (!cachedDirectives) return;
  downloadDirectivesJson(cachedDirectives);
}

function handleExportSummary() {
  const context = getExportContext();
  if (!context) return;
  downloadRunSummaryMd(context);
}

function handleExportCsv() {
  const context = getExportContext();
  if (!context) return;
  downloadDirectivesCsv(context);
}

function handlePrint() {
  printView();
}

async function runDemo(): Promise<void> {
  if (runButton) runButton.disabled = true;
  setError(null);
  setStatusBadge("Running", "pending");

  try {
    const dataset = selectedDataset;
    const baseUrl = import.meta.env.BASE_URL ?? "/";
    let nominal: NominalPosesDataset;
    let asBuilt: AsBuiltPosesDataset;
    let constraints: ConstraintsDataset;
    let paths: DatasetPaths;

    if (dataset === "museum") {
      const { raw, constraints: rawConstraints } = await loadMuseumDataset();
      // Kabsch/Horn alignment from anchor correspondences (mm). T_model_scan maps scan -> model.
      // Apply it so as-built scan-frame poses are transformed into the model/world frame.
      const anchors = normalizeMuseumAnchors(raw);
      const scanPts = anchors.map((anchor) => ({
        anchor_id: anchor.id,
        point_mm: anchor.scan_mm
      }));
      const modelPts = anchors.map((anchor) => ({
        anchor_id: anchor.id,
        point_mm: anchor.model_mm
      }));
      const alignment = computeRigidTransform(scanPts, modelPts);
      const converted = convertMuseumRawToPoseDatasets(raw, alignment.T_model_scan);
      nominal = converted.nominal;
      asBuilt = converted.asBuilt;
      constraints = rawConstraints;
      cachedAlignment = alignment;
      paths = {
        nominal: `${baseUrl}museum_raw.json`,
        asBuilt: `${baseUrl}museum_raw.json`,
        constraints: `${baseUrl}museum_constraints.json`
      };
    } else {
      cachedAlignment = null;
      paths = {
        nominal: `${baseUrl}toy_nominal_poses.json`,
        asBuilt: `${baseUrl}toy_asbuilt_poses.json`,
        constraints: `${baseUrl}toy_constraints.json`
      };

      [nominal, asBuilt, constraints] = await Promise.all([
        fetchJson<NominalPosesDataset>(paths.nominal),
        fetchJson<AsBuiltPosesDataset>(paths.asBuilt),
        fetchJson<ConstraintsDataset>(paths.constraints)
      ]);
    }

    const directives = await runGenerateDirectives(nominal, asBuilt, constraints, paths);

    cachedDirectives = directives;
    cachedNominal = nominal;
    cachedAsBuilt = asBuilt;
    cachedConstraints = constraints;

    const partNames = new Map(nominal.parts.map((part) => [part.part_id, part.part_name]));

    const partSummaries = extractPartSummaries(directives);
    const overallStatus = deriveOverallStatus(partSummaries, directives);
    setStatusBadge(formatStatusLabel(overallStatus), overallStatus);

    renderStatus(directives, asBuilt);
    cachedSummaries = partSummaries;
    renderParts(partSummaries, partNames);
    renderSelection();
    renderAlignmentQuality(dataset);
    renderRawJson({ nominal, asBuilt, constraints, directives });
    updateExportButtons(true);
  } catch (error) {
    const dataset = selectedDataset;
    const message =
      dataset === "museum" && error instanceof DatasetFetchError
        ? formatDatasetError(error)
        : error instanceof Error
          ? error.message
          : "Unknown error";
    setError(`Failed to run directives: ${message}`);
    setStatusBadge("Error");
    cachedAlignment = null;
    if (statusDetails) {
      statusDetails.innerHTML = `<p class="placeholder">${message}</p>`;
    }
    if (partList) {
      partList.innerHTML = `<p class="placeholder">Unable to load parts.</p>`;
    }
    if (actionList) {
      actionList.innerHTML = `<p class="placeholder">Unable to load actions.</p>`;
    }
    if (verificationResidual) {
      verificationResidual.innerHTML = `<p class="placeholder">Unable to load expected residual.</p>`;
    }
    if (constraintsPanel) {
      constraintsPanel.innerHTML = `<p class="placeholder">Unable to load constraints.</p>`;
    }
    if (simulationPanel) {
      simulationPanel.innerHTML = `<p class="placeholder">Unable to load simulation.</p>`;
    }
    renderAlignmentQuality(dataset);
    updateExportButtons(false);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

if (runButton) {
  runButton.addEventListener("click", () => {
    runDemo().catch(() => undefined);
  });
}

if (datasetSelect) {
  datasetSelect.addEventListener("change", () => {
    selectedDataset = datasetSelect.value === "museum" ? "museum" : "toy";
    resetResults(selectedDataset);
    runDemo().catch(() => undefined);
  });
}

// Export button handlers
if (exportJsonButton) {
  exportJsonButton.addEventListener("click", handleExportJson);
}

if (exportSummaryButton) {
  exportSummaryButton.addEventListener("click", handleExportSummary);
}

if (exportCsvButton) {
  exportCsvButton.addEventListener("click", handleExportCsv);
}

if (exportPrintButton) {
  exportPrintButton.addEventListener("click", handlePrint);
}

runDemo().catch(() => undefined);
