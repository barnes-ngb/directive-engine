import { generateDirectives } from "../src/core/index.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  Status,
  Step
} from "../src/types.js";

type DatasetPaths = {
  nominal: string;
  asBuilt: string;
  constraints: string;
};

const statusPriority: Status[] = ["blocked", "needs_review", "clamped", "pending", "ok"];
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
let selectedPartId: string | null = null;

function formatVec(vec?: [number, number, number], digits = 2): string {
  if (!vec) return "n/a";
  return `[${vec.map((value) => value.toFixed(digits)).join(", ")}]`;
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

function deriveOverallStatus(directives: DirectivesOutput): Status {
  const counts = directives.summary?.counts_by_status;
  if (counts) {
    for (const status of statusPriority) {
      if (counts[status] > 0) return status;
    }
  }
  return "ok";
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

function renderParts(steps: Step[], partNames: Map<string, string>) {
  if (!partList) return;

  if (steps.length === 0) {
    partList.innerHTML = `<p class="placeholder">No parts available.</p>`;
    return;
  }

  partList.innerHTML = `
    <ul class="part-list">
      ${steps
        .map((step) => {
          const name = partNames.get(step.part_id) ?? step.part_id;
          const isSelected = step.part_id === selectedPartId;
          return `
            <li>
              <button class="part-button ${isSelected ? "is-selected" : ""}" type="button" data-part-id="${step.part_id}">
                <span class="part-meta">
                  <strong>${name}</strong>
                  <span>Part ${step.part_id}</span>
                </span>
                <span class="badge ${step.status}">${formatStatusLabel(step.status)}</span>
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
  if (!cachedDirectives || !cachedNominal) return;
  const steps = cachedDirectives.steps;
  if (!actionList || !verificationResidual) return;

  const selectedStep = selectedPartId
    ? steps.find((step) => step.part_id === selectedPartId)
    : steps[0];

  if (!selectedStep) {
    actionList.innerHTML = `<p class="placeholder">Select a part to see actions.</p>`;
    verificationResidual.innerHTML = `<p class="placeholder">Select a part to see expected residual.</p>`;
    return;
  }

  selectedPartId = selectedStep.part_id;

  if (selectedStep.actions.length === 0) {
    actionList.innerHTML = `<p class="placeholder">No actions for this part.</p>`;
  } else {
    actionList.innerHTML = `
      <div class="action-list">
        ${selectedStep.actions
          .map((action) => {
            const delta = action.delta?.translation_mm;
            return `
              <div class="action-card">
                <h3>${action.type}</h3>
                <p>${action.description}</p>
                ${delta ? `<p><strong>Δt:</strong> ${formatVec(delta)} mm</p>` : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  const expected = selectedStep.verification?.[0]?.expected_residual;
  verificationResidual.innerHTML = `
    <div class="residual-grid">
      <div><strong>Translation:</strong> ${formatVec(expected?.translation_mm_vec)} mm</div>
      <div><strong>Rotation:</strong> ${expected?.rotation_deg?.toFixed(2) ?? "n/a"}°</div>
      <div><strong>Expected result:</strong> ${selectedStep.verification?.[0]?.expected_result ?? "n/a"}</div>
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

    const overallStatus = deriveOverallStatus(directives);
    setStatusBadge(formatStatusLabel(overallStatus), overallStatus);

    renderStatus(directives, asBuilt);
    renderParts(directives.steps, partNames);
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

if (runButton) {
  runButton.addEventListener("click", () => {
    runDemo().catch(() => undefined);
  });
}

runDemo().catch(() => undefined);
