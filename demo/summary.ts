import type {
  Action,
  DirectivesOutput,
  Status,
  Step,
  Vec3,
  Verification
} from "../src/types.js";

export const STATUS_PRIORITY: Status[] = ["blocked", "needs_review", "clamped", "pending", "ok"];

export type PartSummary = {
  id: string;
  status: Status;
  actions: Action[];
  expectedResidual: Verification["expected_residual"] | null;
};

export type ResidualEntry = {
  id: string;
  magnitude: number;
  translation?: Vec3;
};

type DirectivesLike = Omit<DirectivesOutput, "steps" | "summary"> & {
  steps: Step[] | Record<string, Step>;
  summary?: DirectivesOutput["summary"];
};

function normalizeStatusCounts(
  counts?: Partial<Record<Status, number>>
): Record<Status, number> {
  return STATUS_PRIORITY.reduce((acc, status) => {
    const value = counts?.[status];
    acc[status] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
    return acc;
  }, {} as Record<Status, number>);
}

function normalizeSteps(steps: Step[] | Record<string, Step>): Step[] {
  if (Array.isArray(steps)) return steps;
  return Object.values(steps).sort((a, b) => a.part_id.localeCompare(b.part_id));
}

function vecMagnitude(vec?: Vec3): number | null {
  if (!vec || vec.length !== 3) return null;
  if (!vec.every((component) => Number.isFinite(component))) return null;
  return Math.sqrt(vec.reduce((acc, component) => acc + component * component, 0));
}

export function extractPartSummaries(directives: DirectivesLike): PartSummary[] {
  return normalizeSteps(directives.steps).map((step) => ({
    id: step.part_id,
    status: step.status,
    actions: step.actions ?? [],
    expectedResidual: step.verification?.[0]?.expected_residual ?? null
  }));
}

export function computeResidualsMm(
  directives: Pick<DirectivesLike, "steps">
): { rms: number | null; residuals: ResidualEntry[] } {
  const residuals = normalizeSteps(directives.steps)
    .map((step) => {
      const translation = step.computed_errors?.translation_error_mm_vec;
      const norm = step.computed_errors?.translation_error_norm_mm;
      const magnitude =
        typeof norm === "number" && Number.isFinite(norm) ? norm : vecMagnitude(translation ?? undefined);
      if (magnitude === null) return null;
      return {
        id: step.part_id,
        magnitude,
        translation: translation ?? undefined
      };
    })
    .filter((value): value is ResidualEntry => value !== null);

  if (residuals.length === 0) {
    return { rms: null, residuals };
  }

  const rms = Math.sqrt(residuals.reduce((acc, entry) => acc + entry.magnitude ** 2, 0) / residuals.length);
  return { rms, residuals };
}

export function deriveOverallStatus(
  parts: PartSummary[],
  directives?: Pick<DirectivesLike, "summary">
): Status {
  let counts = normalizeStatusCounts(directives?.summary?.counts_by_status);

  if (Object.values(counts).every((value) => value === 0)) {
    const aggregated = parts.reduce((acc, part) => {
      acc[part.status] = (acc[part.status] ?? 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
    counts = normalizeStatusCounts(aggregated);
  }

  for (const status of STATUS_PRIORITY) {
    if (counts[status] > 0) return status;
  }

  return "ok";
}

export function formatResidual(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function formatVec3(value: Vec3 | null | undefined, digits = 2): string {
  if (!value) return "n/a";
  return value.map((component) => formatResidual(component, digits)).join(", ");
}

export function describeAction(action?: Partial<Action> | null): string {
  if (!action) return "No action";
  const description = action.description?.trim();
  const typeLabel = action.type?.replace(/_/g, " ") ?? "action";
  const base =
    description ||
    (action.type === "noop" ? "No action" : typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1));
  let detail = "";
  switch (action.type) {
    case "translate":
      detail = `Δt: [${formatVec3(action.delta?.translation_mm)}] mm`;
      break;
    case "rotate":
      detail = `Axis: ${action.axis ? action.axis.toUpperCase() : "?"}`;
      break;
    case "rotate_to_index":
      detail = `Index: ${action.target_index ?? "n/a"}`;
      break;
    case "noop":
      detail = "";
      break;
    default:
      detail = "";
      break;
  }
  return detail ? `${base} (${detail})` : base;
}
