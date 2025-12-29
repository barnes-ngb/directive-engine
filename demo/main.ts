import { generateDirectives } from "../src/core/index.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  Status
} from "../src/types.js";
import {
  describeAction,
  deriveOverallStatus,
  extractPartSummaries,
  formatResidual,
  STATUS_PRIORITY
} from "./summary.js";

type DatasetPaths = {
  nominal: string;
  asBuilt: string;
  constraints: string;
};

type DatasetKey = "toy" | "museum";

const statusPriority: Status[] = STATUS_PRIORITY;
const statusClasses = new Set(statusPriority);
const datasetKeys: DatasetKey[] = ["toy", "museum"];

const runButton = document.querySelector<HTMLButtonElement>(".run-button");
const datasetSelect = document.querySelector<HTMLSelectElement>("#dataset-select");
const statusBadge = document.querySelector<HTMLSpanElement>("#status-badge");
const statusDetails = document.querySelector<HTMLDivElement>("#status-details");
const partList = document.querySelector<HTMLDivElement>("#part-list");
const actionList = document.querySelector<HTMLDivElement>("#action-list");
const verificationResidual = document.querySelector<HTMLDivElement>("#verification-residual");
const rawJson = document.querySelector<HTMLPreElement>("#raw-json");
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner");

let selectedDataset: DatasetKey = datasetSelect?.value === "museum" ? "museum" : "toy";
let cachedDirectives: DirectivesOutput | null = null;
let cachedNominal: NominalPosesDataset | null = null;
let cachedAsBuilt: AsBuiltPosesDataset | null = null;
let cachedSummaries: ReturnType<typeof extractPartSummaries> | null = null;
let selectedPartId: string | null = null;

function formatVec(vec?: [number, number, number], digits = 2): string {
  if (!vec) return "n/a";
  return `[${vec.map((value) => formatResidual(value, digits)).join(", ")}]`;
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
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

function resolveDataset(value: string | null): DatasetKey {
  return value === "museum" ? "museum" : "toy";
}

function getDatasetPaths(dataset: DatasetKey, baseUrl: string): DatasetPaths {
  const filenamePrefix = dataset === "museum" ? "museum" : "toy";
  return {
    nominal: `${baseUrl}${filenamePrefix}_nominal_poses.json`,
    asBuilt: `${baseUrl}${filenamePrefix}_asbuilt_poses.json`,
    constraints: `${baseUrl}${filenamePrefix}_constraints.json`
  };
}

function clearResults() {
  cachedDirectives = null;
  cachedNominal = null;
  cachedAsBuilt = null;
  cachedSummaries = null;
  selectedPartId = null;
  setError(null);
  setStatusBadge("Idle");
  if (statusDetails) {
    statusDetails.innerHTML = `<p class="placeholder">Status details will appear here.</p>`;
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
  if (rawJson) {
    rawJson.textContent = "";
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
}

function renderRawJson(payload: unknown) {
  if (!rawJson) return;
  rawJson.textContent = JSON.stringify(payload, null, 2);
}

async function runDemo(dataset: DatasetKey = selectedDataset): Promise<void> {
  if (runButton) runButton.disabled = true;
  setError(null);
  setStatusBadge("Running", "pending");

  try {
    const baseUrl = import.meta.env.BASE_URL ?? "/";
    const paths = getDatasetPaths(dataset, baseUrl);

    const [nominal, asBuilt, constraints] = await Promise.all([
      fetchJson<NominalPosesDataset>(paths.nominal),
      fetchJson<AsBuiltPosesDataset>(paths.asBuilt),
      fetchJson<ConstraintsDataset>(paths.constraints)
    ]);

    const directives = await runGenerateDirectives(nominal, asBuilt, constraints, paths);

    cachedDirectives = directives;
    cachedNominal = nominal;
    cachedAsBuilt = asBuilt;

    const partNames = new Map(nominal.parts.map((part) => [part.part_id, part.part_name]));

    const partSummaries = extractPartSummaries(directives);
    const overallStatus = deriveOverallStatus(partSummaries, directives);
    setStatusBadge(formatStatusLabel(overallStatus), overallStatus);

    renderStatus(directives, asBuilt);
    cachedSummaries = partSummaries;
    renderParts(partSummaries, partNames);
    renderSelection();
    renderRawJson({ nominal, asBuilt, constraints, directives });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setError(`Failed to run directives: ${message}`);
    setStatusBadge("Error");
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
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

if (datasetSelect) {
  datasetSelect.addEventListener("change", () => {
    selectedDataset = resolveDataset(datasetSelect.value);
    clearResults();
    runDemo(selectedDataset).catch(() => undefined);
  });
}

if (runButton) {
  runButton.addEventListener("click", () => {
    runDemo(selectedDataset).catch(() => undefined);
  });
}

if (!datasetKeys.includes(selectedDataset)) {
  selectedDataset = "toy";
}

runDemo(selectedDataset).catch(() => undefined);
