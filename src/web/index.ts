import { generateDirectives } from "../core/index.js";
import type { AsBuiltPosesDataset, ConstraintsDataset, DirectivesOutput, NominalPartPose, NominalPosesDataset } from "../types.js";
import {
  formatActionSummary,
  formatConfidence,
  formatErrorSummary,
  formatStatusLabel,
  formatVec3,
  getPrimaryAction,
  normalizeCounts,
  STATUS_ORDER
} from "./renderHelpers.js";
import "./styles.css";

const datasetBase = `${import.meta.env.BASE_URL}toy_v0_1`;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function renderSummary(directives: DirectivesOutput) {
  const summaryCounts = normalizeCounts(directives.summary);
  const summary = document.querySelector<HTMLDivElement>("#summary-counts");
  if (!summary) return;

  summary.innerHTML = STATUS_ORDER.map((status) => {
    return `\
      <div class="summary-card">
        <div class="count">${summaryCounts[status]}</div>
        <div class="label">${formatStatusLabel(status)}</div>
      </div>
    `;
  }).join("");

  const caption = document.querySelector<HTMLParagraphElement>("#summary-caption");
  if (caption) {
    caption.textContent = `Generated ${directives.steps.length} directives from ${directives.dataset_id}.`;
  }
}

function formatExpectedResult(value?: string): { label: string; className: string } {
  switch (value) {
    case "expected_pass":
      return { label: "Expected pass", className: "verification pass" };
    case "expected_fail":
      return { label: "Expected fail", className: "verification fail" };
    default:
      return { label: "Outcome unknown", className: "verification unknown" };
  }
}

function renderCards(directives: DirectivesOutput, partMap: Map<string, NominalPartPose>) {
  const cards = document.querySelector<HTMLDivElement>("#cards");
  if (!cards) return;

  cards.innerHTML = directives.steps.map((step) => {
    const part = partMap.get(step.part_id);
    const partName = part?.part_name ?? "Unknown part";
    const partType = part?.part_type ?? "Unknown type";
    const confidence = formatConfidence(step.pose_confidence);
    const errors = formatErrorSummary(step);
    const actionSummary = formatActionSummary(getPrimaryAction(step));
    const reasonChips = step.reason_codes.map((code) => `<li>${code}</li>`).join("");
    const verification = step.verification?.[0];
    const expectedResidual = formatVec3(verification?.expected_residual?.translation_mm_vec, 1);
    const verificationResult = formatExpectedResult(verification?.expected_result);
    const actionList = step.actions
      .map((action) => `<li>${formatActionSummary(action)} · ${action.description}</li>`)
      .join("");

    return `\
      <article class="card">
        <div class="card-header">
          <div>
            <h3>${partName}</h3>
            <p class="subhead">Part ${step.part_id}</p>
          </div>
          <span class="badge ${step.status}">${formatStatusLabel(step.status)}</span>
        </div>
        <div class="section">
          <p class="section-title">Part list</p>
          <ul class="part-list">
            <li>${partName} · ${partType} · ${step.part_id}</li>
          </ul>
        </div>
        <div class="meta-grid">
          <div>Pose confidence<span>${confidence}</span></div>
          <div>Errors (t / r)<span>${errors}</span></div>
          <div>Expected residual<span>${expectedResidual} mm</span></div>
          <div>Action<span>${actionSummary}</span></div>
        </div>
        <div class="section">
          <p class="section-title">Actions</p>
          <ul class="action-list">${actionList || "<li>No actions required.</li>"}</ul>
        </div>
        <div class="verification-row">
          <div>
            <p class="section-title">Verification</p>
            <p class="verification-detail">Expected residual: ${expectedResidual} mm</p>
          </div>
          <span class="${verificationResult.className}">${verificationResult.label}</span>
        </div>
        <ul class="reason-list">${reasonChips}</ul>
        <div class="action">${getPrimaryAction(step)?.description ?? "No action description provided."}</div>
      </article>
    `;
  }).join("");
}

async function renderDirectives(): Promise<void> {
  const [nominal, asBuilt, constraints] = await Promise.all([
    fetchJson<NominalPosesDataset>(`${datasetBase}/toy_nominal_poses.json`),
    fetchJson<AsBuiltPosesDataset>(`${datasetBase}/toy_asbuilt_poses.json`),
    fetchJson<ConstraintsDataset>(`${datasetBase}/toy_constraints.json`)
  ]);

  const directives = generateDirectives({
    nominal,
    asBuilt,
    constraints,
    options: {
      inputPaths: {
        nominal: `${datasetBase}/toy_nominal_poses.json`,
        asBuilt: `${datasetBase}/toy_asbuilt_poses.json`,
        constraints: `${datasetBase}/toy_constraints.json`
      }
    }
  });

  const partMap = new Map(nominal.parts.map((part) => [part.part_id, part]));

  const datasetName = document.querySelector<HTMLParagraphElement>("#dataset-name");
  if (datasetName) datasetName.textContent = nominal.dataset_id;

  const datasetMeta = document.querySelector<HTMLParagraphElement>("#dataset-meta");
  if (datasetMeta) {
    datasetMeta.textContent = `Measured at ${asBuilt.measured_at} · Confidence threshold ${constraints.engine_config.confidence_threshold}`;
  }

  renderSummary(directives);
  renderCards(directives, partMap);
}

function renderError(error: Error) {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  app.innerHTML = `\
    <div class="error">
      <strong>Failed to load directives.</strong>
      <div>${error.message}</div>
    </div>
  `;
}

renderDirectives().catch((error: Error) => {
  renderError(error);
});
