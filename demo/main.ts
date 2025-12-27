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
  statusPriority,
  type PartSummary
} from "./summary.js";

type DatasetPaths = {
  nominal: string;
  asBuilt: string;
  constraints: string;
};
const statusClasses = new Set(statusPriority);

const runButton = document.querySelector<HTMLButtonElement>(".run-button");
const statusBadge = document.querySelector<HTMLSpanElement>("#status-badge");
const statusDetails = document.querySelector<HTMLDivElement>("#status-details");
const partList = document.querySelector<HTMLDivElement>("#part-list");
const actionList = document.querySelector<HTMLDivElement>("#action-list");
const verificationResidual = document.querySelector<HTMLDivElement>("#verification-residual");
const rawJson = document.querySelector<HTMLPreElement>("#raw-json");
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner");

let cachedDirectives: DirectivesOutput | null = null;
let cachedNominal: NominalPosesDataset | null = null;
let cachedAsBuilt: AsBuiltPosesDataset | null = null;
let cachedParts: PartSummary[] = [];
let selectedPartId: string | null = null;

function formatVec(vec?: [number, number, number]): string {
  if (!vec) return "n/a";
  return `[${vec.map((value) => formatResidual(value)).join(", ")}]`;
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

function renderParts(parts: PartSummary[], partNames: Map<string, string>) {
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
      renderSelection(parts);
      renderParts(parts, partNames);
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

function renderSelection(parts: PartSummary[]) {
  if (!cachedDirectives || !cachedNominal) return;
  if (!actionList || !verificationResidual) return;

  const selectedPart = selectedPartId
    ? parts.find((part) => part.id === selectedPartId)
    : parts[0];

  if (!selectedPart) {
    actionList.innerHTML = `<p class="placeholder">Select a part to see actions.</p>`;
    verificationResidual.innerHTML = `<p class="placeholder">Select a part to see expected residual.</p>`;
    return;
  }

  selectedPartId = selectedPart.id;

  if (selectedPart.actions.length === 0) {
    actionList.innerHTML = `<p class="placeholder">No actions for this part.</p>`;
  } else {
    actionList.innerHTML = `
      <div class="action-list">
        ${selectedPart.actions
          .map((action) => {
            return `
              <div class="action-card">
                <h3>${describeAction(action)}</h3>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  const expected = selectedPart.expectedResidual;
  verificationResidual.innerHTML = `
    <div class="residual-grid">
      <div><strong>Translation:</strong> ${formatVec(expected?.translation_mm_vec)} mm</div>
      <div><strong>Rotation:</strong> ${formatResidual(expected?.rotation_deg)}°</div>
      <div><strong>Expected result:</strong> n/a</div>
    </div>
  `;
}

function renderRawJson(payload: unknown) {
  if (!rawJson) return;
  rawJson.textContent = JSON.stringify(payload, null, 2);
}

async function runDemo(): Promise<void> {
  if (runButton) runButton.disabled = true;
  setError(null);
  setStatusBadge("Running", "pending");

  try {
    const baseUrl = import.meta.env.BASE_URL ?? "/";
    const paths: DatasetPaths = {
      nominal: `${baseUrl}toy_nominal_poses.json`,
      asBuilt: `${baseUrl}toy_asbuilt_poses.json`,
      constraints: `${baseUrl}toy_constraints.json`
    };

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

    cachedParts = extractPartSummaries(directives);
    const overallStatus = deriveOverallStatus(cachedParts, directives);
    setStatusBadge(formatStatusLabel(overallStatus), overallStatus);

    renderStatus(directives, asBuilt);
    renderParts(cachedParts, partNames);
    renderSelection(cachedParts);
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

if (runButton) {
  runButton.addEventListener("click", () => {
    runDemo().catch(() => undefined);
  });
}

runDemo().catch(() => undefined);
