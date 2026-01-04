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
  normalizeMuseumAnchors,
  type MuseumAnchor
} from "./museum.js";
import { renderAlignmentView, clearAlignmentView } from "./alignmentView.js";
import {
  downloadDirectivesJson,
  downloadRunSummaryMd,
  downloadDirectivesCsv,
  openPrintRunSheet,
  type ExportContext,
  type PrintRunSheetContext
} from "./export.js";
import {
  initOverlay,
  openOverlay,
  isOverlayOpen
} from "./overlay.js";
import {
  parseRouteFromUrl,
  updateUrlFromState,
  type DemoDataset,
  type DemoMode,
  type RouteState
} from "./routing.js";
import {
  getOrCreateRunState,
  markStepCompleted,
  markStepIncomplete,
  markStepEscalated,
  resetStep,
  resetRun,
  updateStepNotes,
  updateStepSimulation,
  getProgressSummary,
  clearRunState,
  type RunState
} from "./runState.js";

type DatasetPaths = {
  nominal: string;
  asBuilt: string;
  constraints: string;
};


const statusPriority: Status[] = STATUS_PRIORITY;
const statusClasses = new Set(statusPriority);

// Calibration warning threshold (configurable constant)
const CALIBRATION_RMS_WARNING_THRESHOLD_MM = 10;

// Core UI elements
const runButton = document.querySelector<HTMLButtonElement>(".run-button");
const datasetSelect = document.querySelector<HTMLSelectElement>("#dataset-select");
const modeSelect = document.querySelector<HTMLSelectElement>("#mode-select");
const statusBadge = document.querySelector<HTMLSpanElement>("#status-badge");
const statusDetails = document.querySelector<HTMLDivElement>("#status-details");
const partList = document.querySelector<HTMLDivElement>("#part-list");
const actionList = document.querySelector<HTMLDivElement>("#action-list");
const verificationResidual = document.querySelector<HTMLDivElement>("#verification-residual");
const alignmentPanel = document.querySelector<HTMLElement>("#alignment-panel");
const alignmentRms = document.querySelector<HTMLSpanElement>("#alignment-rms");
const alignmentResiduals = document.querySelector<HTMLTableSectionElement>("#alignment-residuals");
const alignmentViewCanvas = document.querySelector<HTMLCanvasElement>("#alignment-view-canvas");
const rawJson = document.querySelector<HTMLPreElement>("#raw-json");
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner");
const constraintsPanel = document.querySelector<HTMLDivElement>("#constraints-panel");
const simulationPanel = document.querySelector<HTMLDivElement>("#simulation-panel");
const exportJsonButton = document.querySelector<HTMLButtonElement>("#export-json");
const exportSummaryButton = document.querySelector<HTMLButtonElement>("#export-summary");
const exportCsvButton = document.querySelector<HTMLButtonElement>("#export-csv");
const exportPrintButton = document.querySelector<HTMLButtonElement>("#export-print");

// Runbook mode elements
const runbookProgress = document.querySelector<HTMLDivElement>("#runbook-progress");
const progressCount = document.querySelector<HTMLSpanElement>("#progress-count");
const progressPercent = document.querySelector<HTMLSpanElement>("#progress-percent");
const progressFill = document.querySelector<HTMLDivElement>("#progress-fill");
const resetRunBtn = document.querySelector<HTMLButtonElement>("#reset-run-btn");

// Runbook layout elements
const runbookLayout = document.querySelector<HTMLDivElement>("#runbook-layout");
const runbookCalibrationCard = document.querySelector<HTMLDivElement>("#runbook-calibration-card");
const runbookCalibrationRms = document.querySelector<HTMLSpanElement>("#runbook-calibration-rms");
const runbookCalibrationTopAnchors = document.querySelector<HTMLDivElement>("#runbook-calibration-top-anchors");
const runbookCalibrationDetails = document.querySelector<HTMLDetailsElement>("#runbook-calibration-details");
const runbookCalibrationResiduals = document.querySelector<HTMLTableSectionElement>("#runbook-calibration-residuals");
const runbookCalibrationWarning = document.querySelector<HTMLDivElement>("#runbook-calibration-warning");
const runbookStepTbody = document.querySelector<HTMLTableSectionElement>("#runbook-step-tbody");
const runbookDetailPart = document.querySelector<HTMLHeadingElement>("#runbook-detail-part");
const runbookDetailStatus = document.querySelector<HTMLSpanElement>("#runbook-detail-status");
const runbookDetailBody = document.querySelector<HTMLDivElement>("#runbook-detail-body");
const runbookDetailActions = document.querySelector<HTMLDivElement>("#runbook-detail-actions");
const runbookCompletionControls = document.querySelector<HTMLDivElement>("#runbook-completion-controls");
const runbookNotesInput = document.querySelector<HTMLTextAreaElement>("#runbook-notes");
const runbookResetStepBtn = document.querySelector<HTMLButtonElement>("#runbook-reset-step");

// Old navigation elements (still referenced)
const navPrev = document.querySelector<HTMLButtonElement>("#nav-prev");
const navNext = document.querySelector<HTMLButtonElement>("#nav-next");
const navStep = document.querySelector<HTMLSpanElement>("#nav-step");

// Step mode elements
const stepView = document.querySelector<HTMLDivElement>("#step-view");
const stepPartName = document.querySelector<HTMLHeadingElement>("#step-part-name");
const stepStatusBadge = document.querySelector<HTMLSpanElement>("#step-status-badge");
const stepContent = document.querySelector<HTMLDivElement>("#step-content");
const stepCompleteBtn = document.querySelector<HTMLButtonElement>("#step-complete-btn");
const stepPrev = document.querySelector<HTMLButtonElement>("#step-prev");
const stepNext = document.querySelector<HTMLButtonElement>("#step-next");
const stepNotesInput = document.querySelector<HTMLTextAreaElement>("#step-notes-input");

// Overlay mode elements
const overlayView = document.querySelector<HTMLDivElement>("#overlay-view");
const overlayPart = document.querySelector<HTMLSpanElement>("#overlay-part");
const overlayBadge = document.querySelector<HTMLSpanElement>("#overlay-badge");
const overlayAction = document.querySelector<HTMLDivElement>("#overlay-action");
const overlayDelta = document.querySelector<HTMLDivElement>("#overlay-delta");
const overlayPrevBtn = document.querySelector<HTMLButtonElement>("#overlay-prev");
const overlayNextBtn = document.querySelector<HTMLButtonElement>("#overlay-next");
const overlayCompleteBtn = document.querySelector<HTMLButtonElement>("#overlay-complete");

// State variables
let cachedDirectives: DirectivesOutput | null = null;
let cachedNominal: NominalPosesDataset | null = null;
let cachedAsBuilt: AsBuiltPosesDataset | null = null;
let cachedConstraints: ConstraintsDataset | null = null;
let cachedAlignment: ReturnType<typeof computeRigidTransform> | null = null;
let cachedAnchors: MuseumAnchor[] | null = null;
let cachedSummaries: ReturnType<typeof extractPartSummaries> | null = null;
let selectedPartId: string | null = null;
let currentStepIndex: number = 0;
const cachedSimulationResults = new Map<string, SimulationResult>();

// Route and run state
const initialRoute = parseRouteFromUrl();
let selectedDataset: DemoDataset = initialRoute.dataset;
let selectedMode: DemoMode = initialRoute.mode;
let runState: RunState = getOrCreateRunState(selectedDataset);

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

function handleOpenOverlay(partId: string) {
  if (!cachedDirectives || !cachedNominal) return;

  const step = cachedDirectives.steps.find((s) => s.part_id === partId);
  const nominalPart = cachedNominal.parts.find((p) => p.part_id === partId);
  if (!step || !nominalPart) return;

  const partName = nominalPart.part_name;
  const cachedResult = cachedSimulationResults.get(partId) ?? null;

  openOverlay(partId, partName, step, cachedResult);
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

  const showCheckmarks = selectedMode === "runbook";

  partList.innerHTML = `
    <ul class="part-list">
      ${parts
        .map((part) => {
          const name = partNames.get(part.id) ?? part.id;
          const isSelected = part.id === selectedPartId;
          const isCompleted = runState.steps[part.id]?.completed ?? false;
          const completedClass = isCompleted ? "is-completed" : "";
          const checkmark = showCheckmarks
            ? `<span class="completion-check">${isCompleted ? "✓" : ""}</span>`
            : "";
          return `
            <li>
              <button class="part-button ${isSelected ? "is-selected" : ""} ${completedClass}" type="button" data-part-id="${part.id}">
                ${checkmark}
                <span class="part-meta">
                  <strong>${name}</strong>
                  <span>Part ${part.id}</span>
                </span>
                <span class="badge ${part.status}">${formatStatusLabel(part.status)}</span>
              </button>
              <button class="part-overlay-button ${isCompleted ? "completed" : ""}" type="button" data-part-id="${part.id}" title="Open overlay mode">
                ${isCompleted ? "Done" : "Overlay"}
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
      updateUrlState();
      renderSelection();
      renderParts(parts, partNames);
    });
  });

  partList.querySelectorAll<HTMLButtonElement>(".part-overlay-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const partId = button.dataset.partId;
      if (partId) {
        handleOpenOverlay(partId);
      }
      renderModeView();
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
    // Clear the canvas with N/A message for non-Museum datasets
    if (alignmentViewCanvas) {
      clearAlignmentView(alignmentViewCanvas);
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
    if (alignmentViewCanvas) {
      clearAlignmentView(alignmentViewCanvas);
    }
    return;
  }

  const { rms_mm: rms, residuals_mm: residuals } = cachedAlignment;
  if (alignmentRms) alignmentRms.textContent = formatResidual(rms);

  // Render the alignment view visualization
  if (alignmentViewCanvas && cachedAnchors && cachedAnchors.length > 0) {
    renderAlignmentView({
      canvas: alignmentViewCanvas,
      anchors: cachedAnchors,
      alignment: cachedAlignment
    });
  } else if (alignmentViewCanvas) {
    clearAlignmentView(alignmentViewCanvas);
  }

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

/**
 * Render the calibration card in Runbook mode.
 * Shows RMS, top anchors by residual, and expandable full residuals table.
 * For non-museum datasets, shows N/A.
 * Shows warning when RMS exceeds threshold.
 */
function renderRunbookCalibrationCard(dataset: DemoDataset): void {
  if (!runbookCalibrationCard) return;

  // Always show card in runbook mode
  runbookCalibrationCard.hidden = false;

  // Hide warning by default
  if (runbookCalibrationWarning) runbookCalibrationWarning.hidden = true;

  // For toy dataset, show N/A
  if (dataset !== "museum") {
    if (runbookCalibrationRms) runbookCalibrationRms.textContent = "N/A";
    if (runbookCalibrationTopAnchors) {
      runbookCalibrationTopAnchors.innerHTML = '<span class="calibration-na">Not available for this dataset</span>';
    }
    if (runbookCalibrationDetails) runbookCalibrationDetails.hidden = true;
    return;
  }

  // No alignment data yet
  if (!cachedAlignment) {
    if (runbookCalibrationRms) runbookCalibrationRms.textContent = "—";
    if (runbookCalibrationTopAnchors) {
      runbookCalibrationTopAnchors.innerHTML = '<span class="calibration-na">Run engine to compute calibration</span>';
    }
    if (runbookCalibrationDetails) runbookCalibrationDetails.hidden = true;
    return;
  }

  const { rms_mm: rms, residuals_mm: residuals } = cachedAlignment;

  // Display RMS
  if (runbookCalibrationRms) {
    runbookCalibrationRms.textContent = formatResidual(rms);
  }

  // Show warning if RMS exceeds threshold
  if (runbookCalibrationWarning) {
    if (rms > CALIBRATION_RMS_WARNING_THRESHOLD_MM) {
      // Find top residual anchor for the warning message
      const sortedForWarning = [...residuals].sort((a, b) => b.residual_mm - a.residual_mm);
      const topAnchor = sortedForWarning[0]?.anchor_id || "unknown";
      runbookCalibrationWarning.innerHTML = `Calibration high — re-check anchor pairing (e.g., ${topAnchor}).`;
      runbookCalibrationWarning.hidden = false;
    } else {
      runbookCalibrationWarning.hidden = true;
    }
  }

  // Sort residuals high to low
  const sortedResiduals = [...residuals].sort((a, b) => b.residual_mm - a.residual_mm);

  // Compute outlier threshold (mean + 2*std)
  const mean = residuals.reduce((sum, r) => sum + r.residual_mm, 0) / residuals.length;
  const variance = residuals.reduce((sum, r) => sum + Math.pow(r.residual_mm - mean, 2), 0) / residuals.length;
  const std = Math.sqrt(variance);
  const outlierThreshold = mean + 2 * std;

  // Top 1-3 anchors as chips
  if (runbookCalibrationTopAnchors) {
    const topAnchors = sortedResiduals.slice(0, 3);
    if (topAnchors.length === 0) {
      runbookCalibrationTopAnchors.innerHTML = '<span class="calibration-na">No anchors</span>';
    } else {
      runbookCalibrationTopAnchors.innerHTML = topAnchors
        .map((entry) => {
          const isOutlier = entry.residual_mm > outlierThreshold;
          return `
            <span class="calibration-anchor-chip${isOutlier ? " outlier" : ""}">
              <span class="calibration-anchor-id">${entry.anchor_id}</span>
              <span class="calibration-anchor-residual">${formatResidual(entry.residual_mm)} mm</span>
            </span>
          `;
        })
        .join("");
    }
  }

  // Full residuals table
  if (runbookCalibrationDetails && runbookCalibrationResiduals) {
    if (sortedResiduals.length === 0) {
      runbookCalibrationDetails.hidden = true;
    } else {
      runbookCalibrationDetails.hidden = false;
      runbookCalibrationResiduals.innerHTML = sortedResiduals
        .map((entry) => {
          const isOutlier = entry.residual_mm > outlierThreshold;
          return `
            <tr${isOutlier ? ' class="outlier"' : ""}>
              <td>${entry.anchor_id}</td>
              <td class="numeric">${formatResidual(entry.residual_mm)}</td>
            </tr>
          `;
        })
        .join("");
    }
  }
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
  // Update calibration card to show "Run engine" message
  renderRunbookCalibrationCard(dataset);
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
  const context = getPrintRunSheetContext();
  if (!context) {
    // Fallback to simple window.print if no data available
    window.print();
    return;
  }
  openPrintRunSheet(context).catch((error) => {
    console.error("Failed to generate print run sheet:", error);
    window.print();
  });
}

function getPrintRunSheetContext(): PrintRunSheetContext | null {
  if (!cachedDirectives || !cachedConstraints) return null;
  // Derive base URL for QR codes from current location
  const baseUrl = window.location.origin + window.location.pathname;
  return {
    directives: cachedDirectives,
    alignment: cachedAlignment,
    simulationResults: cachedSimulationResults,
    constraints: cachedConstraints,
    baseUrl
  };
}

// ============================================================================
// Mode Management
// ============================================================================

function setMode(mode: DemoMode): void {
  selectedMode = mode;
  document.body.classList.remove("mode-viewer", "mode-runbook", "mode-step", "mode-overlay");
  document.body.classList.add(`mode-${mode}`);

  // Show/hide mode-specific elements
  if (runbookProgress) runbookProgress.hidden = mode !== "runbook";
  if (runbookCalibrationCard) runbookCalibrationCard.hidden = mode !== "runbook";
  if (runbookLayout) runbookLayout.hidden = mode !== "runbook";
  if (stepView) stepView.hidden = mode !== "step";
  if (overlayView) overlayView.hidden = mode !== "overlay";

  // Update URL
  updateUrlFromState({ dataset: selectedDataset, mode, part: selectedPartId });

  // Re-render for mode-specific views
  if (cachedSummaries) {
    if (mode === "step" || mode === "overlay") {
      renderModeView();
    } else if (mode === "runbook") {
      renderRunbookProgress();
      renderRunbookCalibrationCard(selectedDataset);
      renderRunbookStepTable();
      renderRunbookDetail();
    }
  } else if (mode === "runbook") {
    // Even without summaries, render calibration card (shows "Run engine" message)
    renderRunbookCalibrationCard(selectedDataset);
  }
}

function updateUrlState(): void {
  updateUrlFromState({
    dataset: selectedDataset,
    mode: selectedMode,
    part: selectedPartId
  });
}

function renderRunbookProgress(): void {
  if (!cachedSummaries) return;

  const partIds = cachedSummaries.map((s) => s.id);
  const progress = getProgressSummary(runState, partIds);

  if (progressCount) progressCount.textContent = `${progress.completed} / ${progress.total}`;
  if (progressPercent) progressPercent.textContent = `${progress.percent}%`;
  if (progressFill) progressFill.style.width = `${progress.percent}%`;

  // Update step navigator
  const stepIdx = selectedPartId
    ? partIds.indexOf(selectedPartId)
    : currentStepIndex;
  const effectiveIdx = stepIdx >= 0 ? stepIdx : 0;

  if (navStep) navStep.textContent = `Step ${effectiveIdx + 1} of ${partIds.length}`;
  if (navPrev) navPrev.disabled = effectiveIdx <= 0;
  if (navNext) navNext.disabled = effectiveIdx >= partIds.length - 1;
}

function navigateStep(direction: "prev" | "next"): void {
  if (!cachedSummaries) return;

  const partIds = cachedSummaries.map((s) => s.id);
  const currentIdx = selectedPartId
    ? partIds.indexOf(selectedPartId)
    : currentStepIndex;

  let newIdx = currentIdx;
  if (direction === "prev" && currentIdx > 0) {
    newIdx = currentIdx - 1;
  } else if (direction === "next" && currentIdx < partIds.length - 1) {
    newIdx = currentIdx + 1;
  }

  if (newIdx !== currentIdx) {
    currentStepIndex = newIdx;
    selectedPartId = partIds[newIdx];
    updateUrlState();
    renderSelection();
    renderRunbookProgress();
    renderModeView();
    // Re-render part list to update selection
    if (cachedNominal && cachedSummaries) {
      const partNames = new Map(cachedNominal.parts.map((p) => [p.part_id, p.part_name]));
      renderParts(cachedSummaries, partNames);
    }
  }
}

function toggleStepCompletion(): void {
  if (!selectedPartId) return;

  const currentCompletion = runState.steps[selectedPartId];
  const isCompleted = currentCompletion?.completed ?? false;

  if (isCompleted) {
    runState = markStepIncomplete(runState, selectedPartId);
  } else {
    // Include simulation result if available
    const simResult = cachedSimulationResults.get(selectedPartId);

    runState = markStepCompleted(runState, selectedPartId, {
      notes: stepNotesInput?.value || runbookNotesInput?.value || undefined,
      sim_pass: simResult?.pass,
      sim_after_translation_norm_mm: simResult?.afterError.translation_norm_mm,
      sim_after_rotation_deg: simResult?.afterError.rotation_deg
    });
  }

  renderRunbookProgress();
  renderModeView();

  // Re-render runbook if in runbook mode
  if (selectedMode === "runbook") {
    renderRunbookStepTable();
    renderRunbookDetail();
  }

  // Re-render part list to update completion checkmarks
  if (cachedNominal && cachedSummaries) {
    const partNames = new Map(cachedNominal.parts.map((p) => [p.part_id, p.part_name]));
    renderParts(cachedSummaries, partNames);
  }
}

function handleNotesChange(): void {
  if (!selectedPartId || !stepNotesInput) return;
  runState = updateStepNotes(runState, selectedPartId, stepNotesInput.value);
}

function renderModeView(): void {
  if (selectedMode === "step") {
    renderStepView();
  } else if (selectedMode === "overlay") {
    renderOverlayView();
  }
}

function renderStepView(): void {
  if (!cachedSummaries || !cachedDirectives || !selectedPartId) return;

  const summary = cachedSummaries.find((s) => s.id === selectedPartId);
  const step = cachedDirectives.steps.find((s) => s.part_id === selectedPartId);
  const nominalPart = cachedNominal?.parts.find((p) => p.part_id === selectedPartId);
  const completion = runState.steps[selectedPartId];
  const isCompleted = completion?.completed ?? false;

  if (!summary || !step) return;

  const partName = nominalPart?.part_name ?? selectedPartId;
  if (stepPartName) stepPartName.textContent = partName;

  // Status badge
  if (stepStatusBadge) {
    stepStatusBadge.textContent = formatStatusLabel(summary.status);
    stepStatusBadge.classList.remove(...Array.from(statusClasses));
    stepStatusBadge.classList.add(summary.status);
  }

  // Build content sections
  const actionDesc = summary.actions.length > 0
    ? summary.actions.map((a) => `${a.type}: ${describeAction(a)}`).join("<br>")
    : "No action required";

  const deltaInfo = computeDirectiveDelta(summary.actions);
  const deltaText = deltaInfo
    ? `Translation: ${formatVec(deltaInfo.translation_mm_vec)} mm${deltaInfo.rotation_deg > 1e-6 ? ` | Rotation: ${formatResidual(deltaInfo.rotation_deg)}°` : ""}`
    : "No delta";

  const errorInfo = step.computed_errors;
  const errorText = `Translation: ${formatVec(errorInfo.translation_error_mm_vec)} mm (norm: ${formatResidual(errorInfo.translation_error_norm_mm)} mm) | Rotation: ${formatResidual(errorInfo.rotation_error_deg)}°`;

  if (stepContent) {
    stepContent.innerHTML = `
      <div class="step-content-section">
        <div class="step-content-label">Action</div>
        <div class="step-content-value">${actionDesc}</div>
      </div>
      <div class="step-content-section">
        <div class="step-content-label">Directive Delta</div>
        <div class="step-content-value">${deltaText}</div>
      </div>
      <div class="step-content-section">
        <div class="step-content-label">Current Error</div>
        <div class="step-content-value">${errorText}</div>
      </div>
    `;
  }

  // Complete button
  if (stepCompleteBtn) {
    stepCompleteBtn.textContent = isCompleted ? "Mark Incomplete" : "Mark Complete";
    stepCompleteBtn.classList.toggle("is-completed", isCompleted);
  }

  // Navigation buttons
  const partIds = cachedSummaries.map((s) => s.id);
  const currentIdx = partIds.indexOf(selectedPartId);
  if (stepPrev) stepPrev.disabled = currentIdx <= 0;
  if (stepNext) stepNext.disabled = currentIdx >= partIds.length - 1;

  // Notes
  if (stepNotesInput) {
    stepNotesInput.value = completion?.notes ?? "";
  }
}

function renderOverlayView(): void {
  if (!cachedSummaries || !cachedDirectives || !selectedPartId) return;

  const summary = cachedSummaries.find((s) => s.id === selectedPartId);
  const step = cachedDirectives.steps.find((s) => s.part_id === selectedPartId);
  const completion = runState.steps[selectedPartId];
  const isCompleted = completion?.completed ?? false;

  if (!summary || !step) return;

  if (overlayPart) overlayPart.textContent = selectedPartId;

  if (overlayBadge) {
    overlayBadge.textContent = formatStatusLabel(summary.status);
    overlayBadge.classList.remove(...Array.from(statusClasses));
    overlayBadge.classList.add(summary.status);
  }

  // Action description
  const actionText = summary.actions.length > 0
    ? summary.actions.map((a) => describeAction(a)).join("; ")
    : "No action";
  if (overlayAction) overlayAction.textContent = actionText;

  // Delta
  const deltaInfo = computeDirectiveDelta(summary.actions);
  if (overlayDelta) {
    overlayDelta.textContent = deltaInfo
      ? `Δ ${formatVec(deltaInfo.translation_mm_vec)} mm`
      : "No delta";
  }

  // Navigation
  const partIds = cachedSummaries.map((s) => s.id);
  const currentIdx = partIds.indexOf(selectedPartId);
  if (overlayPrevBtn) overlayPrevBtn.disabled = currentIdx <= 0;
  if (overlayNextBtn) overlayNextBtn.disabled = currentIdx >= partIds.length - 1;

  // Complete button
  if (overlayCompleteBtn) {
    overlayCompleteBtn.classList.toggle("is-completed", isCompleted);
  }
}

// ============================================================================
// Runbook Mode Rendering
// ============================================================================

function getSimBadgeInfo(partId: string, status: string): { label: string; class: string } {
  // If status is blocked or needs_review, simulation is N/A
  if (status === "blocked" || status === "needs_review") {
    return { label: "N/A", class: "na" };
  }

  // Check for cached simulation result
  const simResult = cachedSimulationResults.get(partId);
  if (simResult) {
    return simResult.pass
      ? { label: "PASS", class: "pass" }
      : { label: "FAIL", class: "fail" };
  }

  // Check if we have persisted sim result in run state
  const stepState = runState.steps[partId];
  if (stepState?.sim_pass !== undefined) {
    return stepState.sim_pass
      ? { label: "PASS", class: "pass" }
      : { label: "FAIL", class: "fail" };
  }

  return { label: "PENDING", class: "pending" };
}

function renderRunbookStepTable(): void {
  if (!runbookStepTbody || !cachedSummaries || !cachedNominal) return;

  const partNames = new Map(cachedNominal.parts.map((p) => [p.part_id, p.part_name]));

  runbookStepTbody.innerHTML = cachedSummaries
    .map((summary) => {
      const stepState = runState.steps[summary.id];
      const isCompleted = stepState?.completed ?? false;
      const isEscalated = stepState?.escalated ?? false;
      const isSelected = summary.id === selectedPartId;
      const simBadge = getSimBadgeInfo(summary.id, summary.status);

      const rowClasses = [
        isSelected ? "is-selected" : "",
        isCompleted ? "is-completed" : "",
        isEscalated ? "is-escalated" : ""
      ].filter(Boolean).join(" ");

      const doneCheckClasses = [
        "runbook-done-check",
        isCompleted ? "is-done" : "",
        isEscalated && !isCompleted ? "is-escalated" : ""
      ].filter(Boolean).join(" ");

      const doneSymbol = isCompleted ? "✓" : (isEscalated ? "!" : "");

      return `
        <tr class="${rowClasses}" data-part-id="${summary.id}">
          <td>${partNames.get(summary.id) ?? summary.id}</td>
          <td><span class="badge ${summary.status}">${formatStatusLabel(summary.status)}</span></td>
          <td><span class="runbook-sim-badge ${simBadge.class}">${simBadge.label}</span></td>
          <td><span class="${doneCheckClasses}">${doneSymbol}</span></td>
        </tr>
      `;
    })
    .join("");

  // Attach click handlers
  runbookStepTbody.querySelectorAll<HTMLTableRowElement>("tr").forEach((row) => {
    row.addEventListener("click", () => {
      const partId = row.dataset.partId;
      if (partId) {
        selectedPartId = partId;
        updateUrlState();
        renderRunbookStepTable();
        renderRunbookDetail();
      }
    });
  });
}

function renderRunbookDetail(): void {
  if (!cachedSummaries || !cachedDirectives || !cachedConstraints) return;

  if (!selectedPartId) {
    // No part selected
    if (runbookDetailPart) runbookDetailPart.textContent = "Select a step";
    if (runbookDetailStatus) {
      runbookDetailStatus.textContent = "—";
      runbookDetailStatus.classList.remove(...Array.from(statusClasses));
    }
    if (runbookDetailBody) {
      runbookDetailBody.innerHTML = `<p class="placeholder">Click a row to see step details.</p>`;
    }
    if (runbookDetailActions) runbookDetailActions.hidden = true;
    return;
  }

  const summary = cachedSummaries.find((s) => s.id === selectedPartId);
  const step = cachedDirectives.steps.find((s) => s.part_id === selectedPartId);
  const nominalPart = cachedNominal?.parts.find((p) => p.part_id === selectedPartId);
  const partConstraint = cachedConstraints.parts.find((p) => p.part_id === selectedPartId);
  const stepState = runState.steps[selectedPartId];

  if (!summary || !step) return;

  const partName = nominalPart?.part_name ?? selectedPartId;

  // Header
  if (runbookDetailPart) runbookDetailPart.textContent = partName;
  if (runbookDetailStatus) {
    runbookDetailStatus.textContent = formatStatusLabel(summary.status);
    runbookDetailStatus.classList.remove(...Array.from(statusClasses));
    runbookDetailStatus.classList.add(summary.status);
  }

  // Build detail body
  const actionDesc = summary.actions.length > 0
    ? summary.actions.map((a) => `${a.type}: ${describeAction(a)}`).join("<br>")
    : "No action required";

  const deltaInfo = computeDirectiveDelta(summary.actions);
  const deltaText = deltaInfo
    ? `Translation: ${formatVec(deltaInfo.translation_mm_vec)} mm${deltaInfo.rotation_deg > 1e-6 ? ` | Rotation: ${formatResidual(deltaInfo.rotation_deg)}°` : ""}`
    : "No delta";

  const errorInfo = step.computed_errors;
  const errorText = `Translation: ${formatVec(errorInfo.translation_error_mm_vec)} mm (norm: ${formatResidual(errorInfo.translation_error_norm_mm)} mm)<br>Rotation: ${formatResidual(errorInfo.rotation_error_deg)}°`;

  // Get simulation info
  const simResult = cachedSimulationResults.get(selectedPartId);
  const simBadge = getSimBadgeInfo(selectedPartId, summary.status);
  const canSimulate = summary.status !== "blocked" && summary.status !== "needs_review";

  let simSection = "";
  if (canSimulate) {
    if (simResult) {
      simSection = `
        <div class="runbook-detail-section">
          <div class="runbook-detail-label">Simulation Result</div>
          <div class="runbook-detail-value">
            <span class="runbook-sim-badge ${simBadge.class}">${simBadge.label}</span>
            After: ${formatResidual(simResult.afterError.translation_norm_mm)} mm / ${formatResidual(simResult.afterError.rotation_deg)}°
            <br>
            <button class="simulate-button simulated" type="button" id="runbook-resimulate">Re-simulate</button>
          </div>
        </div>
      `;
    } else {
      simSection = `
        <div class="runbook-detail-section">
          <div class="runbook-detail-label">Simulation</div>
          <div class="runbook-detail-value">
            <span class="runbook-sim-badge pending">PENDING</span>
            <button class="simulate-button" type="button" id="runbook-simulate">Simulate Apply</button>
          </div>
        </div>
      `;
    }
  } else {
    simSection = `
      <div class="runbook-detail-section">
        <div class="runbook-detail-label">Simulation</div>
        <div class="runbook-detail-value">
          <span class="runbook-sim-badge na">N/A</span>
          Cannot simulate: ${formatStatusLabel(summary.status)}
        </div>
      </div>
    `;
  }

  if (runbookDetailBody) {
    runbookDetailBody.innerHTML = `
      <div class="runbook-detail-section">
        <div class="runbook-detail-label">Action</div>
        <div class="runbook-detail-value">${actionDesc}</div>
      </div>
      <div class="runbook-detail-section">
        <div class="runbook-detail-label">Directive Delta</div>
        <div class="runbook-detail-value">${deltaText}</div>
      </div>
      <div class="runbook-detail-section">
        <div class="runbook-detail-label">Current Error</div>
        <div class="runbook-detail-value">${errorText}</div>
      </div>
      ${simSection}
    `;

    // Attach simulate button handlers
    const simBtn = runbookDetailBody.querySelector<HTMLButtonElement>("#runbook-simulate, #runbook-resimulate");
    if (simBtn) {
      simBtn.addEventListener("click", () => {
        if (selectedPartId) {
          runSimulation(selectedPartId);
          renderRunbookStepTable();
          renderRunbookDetail();
        }
      });
    }
  }

  // Show actions panel
  if (runbookDetailActions) runbookDetailActions.hidden = false;

  // Build completion controls based on status
  const isCompleted = stepState?.completed ?? false;
  const isEscalated = stepState?.escalated ?? false;
  const isBlocked = summary.status === "blocked" || summary.status === "needs_review";
  const simPassed = simResult?.pass === true || stepState?.sim_pass === true;

  if (runbookCompletionControls) {
    let controlsHtml = "";

    if (isCompleted) {
      // Already completed - show undo button
      controlsHtml = `
        <button class="runbook-mark-complete-btn is-completed" id="runbook-mark-incomplete">
          ✓ Completed
        </button>
        <span class="runbook-completion-hint">Click to mark incomplete</span>
      `;
    } else if (isBlocked) {
      // Blocked or needs_review - can only escalate
      if (isEscalated) {
        controlsHtml = `
          <span class="runbook-sim-badge" style="background: #fef3c7; color: #b45309;">ESCALATED</span>
          <span class="runbook-completion-hint">This step has been escalated.</span>
        `;
      } else {
        controlsHtml = `
          <button class="runbook-mark-complete-btn" disabled>Mark Complete</button>
          <button class="runbook-escalate-btn" id="runbook-escalate">Escalate</button>
          <span class="runbook-completion-hint">Cannot complete: ${formatStatusLabel(summary.status)}. Escalate with a note.</span>
        `;
      }
    } else {
      // Normal status - check sim pass
      if (simPassed) {
        controlsHtml = `
          <button class="runbook-mark-complete-btn" id="runbook-mark-complete">Mark Complete</button>
        `;
      } else {
        controlsHtml = `
          <button class="runbook-mark-complete-btn" disabled>Mark Complete</button>
          <button class="runbook-override-btn" id="runbook-override">Override Complete</button>
          <span class="runbook-completion-hint">Simulation must pass or use override with note.</span>
        `;
      }
    }

    runbookCompletionControls.innerHTML = controlsHtml;

    // Attach button handlers
    const markCompleteBtn = runbookCompletionControls.querySelector<HTMLButtonElement>("#runbook-mark-complete");
    const markIncompleteBtn = runbookCompletionControls.querySelector<HTMLButtonElement>("#runbook-mark-incomplete");
    const overrideBtn = runbookCompletionControls.querySelector<HTMLButtonElement>("#runbook-override");
    const escalateBtn = runbookCompletionControls.querySelector<HTMLButtonElement>("#runbook-escalate");

    if (markCompleteBtn) {
      markCompleteBtn.addEventListener("click", handleRunbookMarkComplete);
    }
    if (markIncompleteBtn) {
      markIncompleteBtn.addEventListener("click", handleRunbookMarkIncomplete);
    }
    if (overrideBtn) {
      overrideBtn.addEventListener("click", handleRunbookOverride);
    }
    if (escalateBtn) {
      escalateBtn.addEventListener("click", handleRunbookEscalate);
    }
  }

  // Update notes field
  if (runbookNotesInput) {
    runbookNotesInput.value = stepState?.notes ?? "";
  }
}

function handleRunbookMarkComplete(): void {
  if (!selectedPartId) return;

  const simResult = cachedSimulationResults.get(selectedPartId);
  runState = markStepCompleted(runState, selectedPartId, {
    notes: runbookNotesInput?.value || undefined,
    sim_pass: simResult?.pass,
    sim_after_translation_norm_mm: simResult?.afterError.translation_norm_mm,
    sim_after_rotation_deg: simResult?.afterError.rotation_deg
  });

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
}

function handleRunbookMarkIncomplete(): void {
  if (!selectedPartId) return;

  runState = markStepIncomplete(runState, selectedPartId);

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
}

function handleRunbookOverride(): void {
  if (!selectedPartId) return;

  const notes = runbookNotesInput?.value?.trim();
  if (!notes) {
    alert("A note is required to override completion without simulation pass.");
    runbookNotesInput?.focus();
    return;
  }

  if (!confirm(`Override completion for this step?\n\nNote: ${notes}`)) {
    return;
  }

  const simResult = cachedSimulationResults.get(selectedPartId);
  runState = markStepCompleted(runState, selectedPartId, {
    notes,
    sim_pass: simResult?.pass ?? false,
    sim_after_translation_norm_mm: simResult?.afterError.translation_norm_mm,
    sim_after_rotation_deg: simResult?.afterError.rotation_deg
  });

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
}

function handleRunbookEscalate(): void {
  if (!selectedPartId) return;

  const notes = runbookNotesInput?.value?.trim();
  if (!notes) {
    alert("A note is required to escalate this step.");
    runbookNotesInput?.focus();
    return;
  }

  runState = markStepEscalated(runState, selectedPartId, notes);

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
}

function handleRunbookNotesChange(): void {
  if (!selectedPartId || !runbookNotesInput) return;
  runState = updateStepNotes(runState, selectedPartId, runbookNotesInput.value);
}

function handleResetStep(): void {
  if (!selectedPartId) return;

  if (!confirm(`Reset step for part ${selectedPartId}?\n\nThis will clear completion status and notes.`)) {
    return;
  }

  runState = resetStep(runState, selectedPartId);
  // Also clear cached simulation
  cachedSimulationResults.delete(selectedPartId);

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
}

function handleResetRun(): void {
  if (!confirm(`Reset entire run for ${selectedDataset}?\n\nThis will clear all completion data.`)) {
    return;
  }

  runState = resetRun(selectedDataset);
  cachedSimulationResults.clear();

  renderRunbookProgress();
  renderRunbookStepTable();
  renderRunbookDetail();
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
      cachedAnchors = anchors; // Store anchors for alignment view visualization
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
      cachedAnchors = null;
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

    // Set initial part selection if none selected
    if (!selectedPartId && partSummaries.length > 0) {
      selectedPartId = partSummaries[0].id;
    }

    renderParts(partSummaries, partNames);
    renderSelection();
    renderAlignmentQuality(dataset);
    renderRunbookCalibrationCard(dataset);
    renderRawJson({ nominal, asBuilt, constraints, directives });
    updateExportButtons(true);

    // Render mode-specific views
    renderRunbookProgress();
    renderModeView();
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
    renderRunbookCalibrationCard(dataset);
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
  // Sync dataset select with initial route
  datasetSelect.value = selectedDataset;

  datasetSelect.addEventListener("change", () => {
    selectedDataset = datasetSelect.value === "museum" ? "museum" : "toy";
    runState = getOrCreateRunState(selectedDataset);
    resetResults(selectedDataset);
    updateUrlState();
    runDemo().catch(() => undefined);
  });
}

// Mode select handler
if (modeSelect) {
  // Sync mode select with initial route
  modeSelect.value = selectedMode;

  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value as DemoMode;
    setMode(mode);
  });
}

// Runbook navigation handlers
if (navPrev) {
  navPrev.addEventListener("click", () => navigateStep("prev"));
}

if (navNext) {
  navNext.addEventListener("click", () => navigateStep("next"));
}

// Step mode handlers
if (stepCompleteBtn) {
  stepCompleteBtn.addEventListener("click", toggleStepCompletion);
}

if (stepPrev) {
  stepPrev.addEventListener("click", () => navigateStep("prev"));
}

if (stepNext) {
  stepNext.addEventListener("click", () => navigateStep("next"));
}

if (stepNotesInput) {
  stepNotesInput.addEventListener("blur", handleNotesChange);
}

// Runbook mode handlers
if (resetRunBtn) {
  resetRunBtn.addEventListener("click", handleResetRun);
}

if (runbookResetStepBtn) {
  runbookResetStepBtn.addEventListener("click", handleResetStep);
}

if (runbookNotesInput) {
  runbookNotesInput.addEventListener("blur", handleRunbookNotesChange);
}

// Overlay mode handlers
if (overlayPrevBtn) {
  overlayPrevBtn.addEventListener("click", () => navigateStep("prev"));
}

if (overlayNextBtn) {
  overlayNextBtn.addEventListener("click", () => navigateStep("next"));
}

if (overlayCompleteBtn) {
  overlayCompleteBtn.addEventListener("click", toggleStepCompletion);
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

// Initialize overlay mode
initOverlay({
  onSimulate: (partId: string) => {
    return runSimulation(partId);
  },
  onClose: () => {
    // Re-render the current selection when overlay closes
    if (selectedPartId) {
      renderSelection();
    }
  },
  onMarkComplete: (partId: string, note: string | null, simPassed: boolean) => {
    console.log(`Part ${partId} marked complete. Sim passed: ${simPassed}, Note: ${note ?? "(none)"}`);
  }
});

// Initialize mode on page load
setMode(selectedMode);

// Track whether we've auto-run for deep links (to prevent double execution)
let hasAutoRun = false;

/**
 * Apply part selection from URL after directives are loaded.
 * Scrolls to the part in the list and selects it.
 */
function applyPartFromUrl(): void {
  if (!initialRoute.part || !cachedSummaries) return;

  const partExists = cachedSummaries.some((s) => s.id === initialRoute.part);
  if (!partExists) return;

  selectedPartId = initialRoute.part;
  const partIds = cachedSummaries.map((s) => s.id);
  currentStepIndex = partIds.indexOf(selectedPartId);
  renderSelection();
  renderModeView();
  renderRunbookProgress();

  if (cachedNominal) {
    const partNames = new Map(cachedNominal.parts.map((p) => [p.part_id, p.part_name]));
    renderParts(cachedSummaries, partNames);
  }

  // If in runbook mode, render the step table and detail
  if (selectedMode === "runbook") {
    renderRunbookStepTable();
    renderRunbookDetail();
  }
}

// Auto-run on page load for non-viewer modes (runbook, step, overlay)
// This ensures parts are populated for deep links to work
if (selectedMode !== "viewer" && !hasAutoRun) {
  hasAutoRun = true;
  runDemo()
    .then(() => {
      applyPartFromUrl();
    })
    .catch(() => undefined);
}
