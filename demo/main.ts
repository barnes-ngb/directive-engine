import { generateDirectives } from "../src/core/index.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  DirectivesOutput,
  NominalPosesDataset,
  Step,
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

const statusPriority: Status[] = STATUS_PRIORITY;
const statusClasses = new Set(statusPriority);

const runButton = document.querySelector<HTMLButtonElement>(".run-button");
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

let cachedDirectives: DirectivesOutput | null = null;
let cachedNominal: NominalPosesDataset | null = null;
let cachedAsBuilt: AsBuiltPosesDataset | null = null;
let cachedSummaries: ReturnType<typeof extractPartSummaries> | null = null;
let selectedPartId: string | null = null;

type AlignmentResidual = {
  anchorId: string;
  magnitudeMm: number | null;
  dxMm: number | null;
  dyMm: number | null;
  dzMm: number | null;
};

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

function isMuseumDataset(datasetId: string): boolean {
  return datasetId.trim().toLowerCase() === "museum";
}

function computeResidualsMm(steps: Step[]): { rmsMm: number | null; residuals: AlignmentResidual[] } {
  const residuals = steps.map((step) => {
    const vec = step.computed_errors?.translation_error_mm_vec ?? null;
    const magnitude =
      step.computed_errors?.translation_error_norm_mm ??
      (vec ? Math.hypot(vec[0], vec[1], vec[2]) : null);
    return {
      anchorId: step.part_id,
      magnitudeMm: Number.isFinite(magnitude) ? magnitude : null,
      dxMm: vec?.[0] ?? null,
      dyMm: vec?.[1] ?? null,
      dzMm: vec?.[2] ?? null
    };
  });

  const magnitudes = residuals
    .map((entry) => entry.magnitudeMm)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const rmsMm =
    magnitudes.length > 0
      ? Math.sqrt(magnitudes.reduce((acc, value) => acc + value ** 2, 0) / magnitudes.length)
      : null;
  return { rmsMm, residuals };
}

function renderAlignmentQuality(directives: DirectivesOutput | null) {
  if (!alignmentPanel || !alignmentRms || !alignmentResiduals) return;

  if (!directives || !isMuseumDataset(directives.dataset_id)) {
    alignmentPanel.hidden = true;
    alignmentRms.textContent = "n/a";
    alignmentResiduals.innerHTML = "";
    return;
  }

  alignmentPanel.hidden = false;
  const { rmsMm, residuals } = computeResidualsMm(directives.steps);
  alignmentRms.textContent = formatResidual(rmsMm, 2);

  if (residuals.length === 0) {
    alignmentResiduals.innerHTML = `
      <tr>
        <td class="placeholder" colspan="5">No residuals available.</td>
      </tr>
    `;
    return;
  }

  alignmentResiduals.innerHTML = residuals
    .map((entry) => {
      return `
        <tr>
          <td>${entry.anchorId}</td>
          <td>${formatResidual(entry.magnitudeMm, 2)}</td>
          <td>${formatResidual(entry.dxMm, 2)}</td>
          <td>${formatResidual(entry.dyMm, 2)}</td>
          <td>${formatResidual(entry.dzMm, 2)}</td>
        </tr>
      `;
    })
    .join("");
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

    const partSummaries = extractPartSummaries(directives);
    const overallStatus = deriveOverallStatus(partSummaries, directives);
    setStatusBadge(formatStatusLabel(overallStatus), overallStatus);

    renderStatus(directives, asBuilt);
    cachedSummaries = partSummaries;
    renderParts(partSummaries, partNames);
    renderSelection();
    renderAlignmentQuality(directives);
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
    renderAlignmentQuality(null);
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
