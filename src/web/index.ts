import { generateDirectives } from "../core/index.js";
import type { DirectivesOutput, NominalPosesDataset, Status, Step } from "../core/types.js";

const datasetBase = "/toy_v0_1";

const statusLabels: Record<Status, string> = {
  ok: "OK",
  pending: "Pending",
  clamped: "Clamped",
  blocked: "Blocked",
  needs_review: "Needs review"
};

const statusClass: Record<Status, string> = {
  ok: "status-ok",
  pending: "status-pending",
  clamped: "status-clamped",
  blocked: "status-blocked",
  needs_review: "status-review"
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function formatVec(vec: [number, number, number]): string {
  return vec.map((value) => value.toFixed(2)).join(", ");
}

function renderHeader(directives: DirectivesOutput): string {
  return `
    <header class="hero">
      <div>
        <p class="eyebrow">Directive Engine</p>
        <h1>Toy dataset directives</h1>
        <p class="muted">Dataset <strong>${directives.dataset_id}</strong> · Generated at ${new Date(directives.generated_at).toLocaleString()}</p>
      </div>
      <div class="summary">
        ${Object.entries(directives.summary.counts_by_status)
          .map(
            ([status, count]) => `
            <div class="summary-card ${statusClass[status as Status]}">
              <span class="summary-count">${count}</span>
              <span class="summary-label">${statusLabels[status as Status]}</span>
            </div>
          `
          )
          .join("")}
      </div>
    </header>
  `;
}

function renderPartList(steps: Step[], partNameById: Map<string, string>): string {
  const items = steps
    .map((step) => {
      const name = partNameById.get(step.part_id) ?? step.part_id;
      return `
        <li>
          <span>${name}</span>
          <span class="status-pill ${statusClass[step.status]}">${statusLabels[step.status]}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <h2>Parts</h2>
      <ul class="part-list">
        ${items}
      </ul>
    </section>
  `;
}

function renderActions(step: Step): string {
  if (step.actions.length === 0) {
    return `<p class="muted">No actions issued.</p>`;
  }

  return `
    <ul class="actions">
      ${step.actions
        .map((action) => {
          const delta = action.delta
            ? `ΔT [${formatVec(action.delta.translation_mm)}] mm`
            : "";
          const clamp = action.clamp_applied ? " · clamped" : "";
          return `
            <li>
              <strong>${action.type}</strong> — ${action.description}
              ${delta ? `<div class="action-meta">${delta}${clamp}</div>` : ""}
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderVerification(step: Step): string {
  return step.verification
    .map((verification) => {
      const expectedResultLabel =
        verification.expected_result === "expected_pass"
          ? "Pass expected"
          : verification.expected_result === "expected_fail"
          ? "Fail expected"
          : "Outcome unknown";

      return `
        <div class="verification">
          <div>
            <p class="muted">Expected residual</p>
            <p>ΔT [${formatVec(verification.expected_residual.translation_mm_vec)}] mm</p>
            <p>ΔR ${verification.expected_residual.rotation_deg.toFixed(2)}°</p>
          </div>
          <span class="result ${verification.expected_result}">${expectedResultLabel}</span>
        </div>
      `;
    })
    .join("");
}

function renderCards(steps: Step[], partNameById: Map<string, string>): string {
  return `
    <section class="cards">
      ${steps
        .map((step) => {
          const partName = partNameById.get(step.part_id) ?? step.part_id;
          return `
            <article class="card">
              <header>
                <div>
                  <p class="card-title">${partName}</p>
                  <p class="muted">${step.part_id} · ${step.step_id}</p>
                </div>
                <span class="status-pill ${statusClass[step.status]}">${statusLabels[step.status]}</span>
              </header>
              <section>
                <h3>Actions</h3>
                ${renderActions(step)}
              </section>
              <section>
                <h3>Verification</h3>
                ${renderVerification(step)}
              </section>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderApp(directives: DirectivesOutput, nominal: NominalPosesDataset): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  const partNameById = new Map(nominal.parts.map((part) => [part.part_id, part.part_name]));

  app.innerHTML = `
    ${renderHeader(directives)}
    <main>
      ${renderPartList(directives.steps, partNameById)}
      ${renderCards(directives.steps, partNameById)}
    </main>
  `;
}

async function renderDirectives(): Promise<void> {
  const [nominal, asBuilt, constraints] = await Promise.all([
    fetchJson<NominalPosesDataset>(`${datasetBase}/toy_nominal_poses.json`),
    fetchJson(`${datasetBase}/toy_asbuilt_poses.json`),
    fetchJson(`${datasetBase}/toy_constraints.json`)
  ]);

  const directives = generateDirectives(nominal, asBuilt, constraints, {
    inputPaths: {
      nominal: `${datasetBase}/toy_nominal_poses.json`,
      asBuilt: `${datasetBase}/toy_asbuilt_poses.json`,
      constraints: `${datasetBase}/toy_constraints.json`
    }
  });

  renderApp(directives, nominal);
}

function applyBaseStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: light;
      font-family: "Inter", system-ui, sans-serif;
      background: #f5f6f8;
      color: #1f2933;
    }

    body {
      margin: 0;
      padding: 32px;
    }

    #app {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .hero {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 24px;
      align-items: center;
    }

    .hero h1 {
      margin: 8px 0;
      font-size: 32px;
    }

    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 12px;
      color: #5b677a;
      margin: 0;
    }

    .muted {
      color: #6b7280;
      margin: 4px 0;
      font-size: 14px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      min-width: 260px;
    }

    .summary-card {
      background: white;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .summary-count {
      font-size: 22px;
      font-weight: 600;
    }

    .summary-label {
      font-size: 12px;
      color: #6b7280;
    }

    main {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 3fr;
      gap: 24px;
    }

    .panel {
      background: white;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
      border: 1px solid #e5e7eb;
    }

    .part-list {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .part-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .card-title {
      margin: 0;
      font-weight: 600;
      font-size: 18px;
    }

    .status-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-ok {
      background: #d1fae5;
      color: #065f46;
    }

    .status-pending {
      background: #e0f2fe;
      color: #0369a1;
    }

    .status-clamped {
      background: #fef3c7;
      color: #92400e;
    }

    .status-blocked {
      background: #fee2e2;
      color: #991b1b;
    }

    .status-review {
      background: #ede9fe;
      color: #5b21b6;
    }

    .actions {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 14px;
    }

    .action-meta {
      margin-top: 6px;
      font-size: 12px;
      color: #6b7280;
    }

    .verification {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #f8fafc;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      font-size: 14px;
    }

    .result {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }

    .expected_pass {
      background: #dcfce7;
      color: #166534;
    }

    .expected_fail {
      background: #fee2e2;
      color: #b91c1c;
    }

    .unknown {
      background: #e2e8f0;
      color: #475569;
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

applyBaseStyles();

renderDirectives().catch((error: Error) => {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  app.innerHTML = `
    <div class="panel">
      <h2>Failed to load directives</h2>
      <p class="muted">${error.message}</p>
    </div>
  `;
});
