import type { Action, DirectivesOutput, Status, Vec3, Verification } from "../src/types.js";

type StepLike = {
  part_id?: string;
  status?: Status;
  actions?: Action[] | null;
  verification?: Verification[] | null;
};

type StepsInput = StepLike[] | Record<string, StepLike> | null | undefined;

type SummaryInput = {
  summary?: DirectivesOutput["summary"] | null;
  steps?: StepsInput;
} | null | undefined;

export type PartSummary = {
  id: string;
  status: Status;
  actions: Action[];
  expectedResidual: Verification["expected_residual"] | null;
};

export const statusPriority: Status[] = [
  "blocked",
  "needs_review",
  "clamped",
  "pending",
  "ok"
];

function normalizeStatus(status: unknown): Status {
  return statusPriority.includes(status as Status) ? (status as Status) : "pending";
}

function formatVec(vec?: Vec3): string {
  if (!vec) return "n/a";
  return `[${vec.map((value) => formatResidual(value)).join(", ")}]`;
}

export function extractPartSummaries(output: SummaryInput): PartSummary[] {
  const steps = output?.steps;
  if (!steps) return [];

  if (Array.isArray(steps)) {
    return steps.map((step) => ({
      id: step.part_id ?? "unknown",
      status: normalizeStatus(step.status),
      actions: Array.isArray(step.actions) ? step.actions : [],
      expectedResidual:
        Array.isArray(step.verification) && step.verification.length > 0
          ? step.verification[0]?.expected_residual ?? null
          : null
    }));
  }

  if (typeof steps === "object") {
    return Object.entries(steps).map(([partId, step]) => ({
      id: step.part_id ?? partId,
      status: normalizeStatus(step.status),
      actions: Array.isArray(step.actions) ? step.actions : [],
      expectedResidual:
        Array.isArray(step.verification) && step.verification.length > 0
          ? step.verification[0]?.expected_residual ?? null
          : null
    }));
  }

  return [];
}

export function deriveOverallStatus(parts: PartSummary[], output: SummaryInput): Status {
  const counts = output?.summary?.counts_by_status;
  if (counts) {
    for (const status of statusPriority) {
      if (counts[status] > 0) return status;
    }
  }

  const countsFromParts = parts.reduce<Record<Status, number>>((acc, part) => {
    acc[part.status] = (acc[part.status] ?? 0) + 1;
    return acc;
  }, { ok: 0, pending: 0, clamped: 0, blocked: 0, needs_review: 0 });

  for (const status of statusPriority) {
    if (countsFromParts[status] > 0) return status;
  }

  return "ok";
}

export function formatResidual(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

export function describeAction(action?: Partial<Action> | null): string {
  const typeLabel = action?.type ? action.type.replace(/_/g, " ") : "action";
  const description = action?.description?.trim();
  const details: string[] = [];

  if (action?.axis) {
    details.push(`axis ${action.axis}`);
  }

  if (action?.target_index !== undefined && action?.target_index !== null) {
    details.push(`index ${action.target_index}`);
  }

  if (action?.delta?.translation_mm) {
    details.push(`Δt ${formatVec(action.delta.translation_mm)} mm`);
  }

  const detailSuffix = details.length > 0 ? ` (${details.join(", ")})` : "";

  if (description) {
    return `${typeLabel}: ${description}${detailSuffix}`;
  }

  return `${typeLabel}${detailSuffix}`;
}
