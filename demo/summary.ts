import type { Action, DirectivesOutput, Status, Step, Vec3 } from "../src/core/types.js";

export const STATUS_PRIORITY: Status[] = ["blocked", "needs_review", "clamped", "pending", "ok"];

export type PartSummary = {
  part_id: string;
  status: Status;
  actions: Action[];
  step: Step;
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

export function extractPartSummaries(directives: DirectivesLike): PartSummary[] {
  return normalizeSteps(directives.steps).map((step) => ({
    part_id: step.part_id,
    status: step.status,
    actions: step.actions,
    step
  }));
}

export function deriveOverallStatus(directives: DirectivesLike): Status {
  let counts = normalizeStatusCounts(directives.summary?.counts_by_status);

  if (Object.values(counts).every((value) => value === 0)) {
    const aggregated = normalizeSteps(directives.steps).reduce((acc, step) => {
      acc[step.status] = (acc[step.status] ?? 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
    counts = normalizeStatusCounts(aggregated);
  }

  for (const status of STATUS_PRIORITY) {
    if (counts[status] > 0) return status;
  }

  return "ok";
}

export function formatResidual(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function formatVec3(value: Vec3 | null | undefined, digits = 2): string {
  if (!value) return "n/a";
  return value.map((component) => formatResidual(component, digits)).join(", ");
}

export function describeAction(action?: Action): string {
  if (!action) return "No action";
  switch (action.type) {
    case "translate":
      return `Translate by [${formatVec3(action.delta?.translation_mm)}] mm`;
    case "rotate":
      return `Rotate about ${action.axis ? action.axis.toUpperCase() : "?"} axis`;
    case "rotate_to_index":
      return `Rotate to index ${action.target_index ?? "n/a"}`;
    case "noop":
      return "No action";
    default:
      return "Action";
  }
}
