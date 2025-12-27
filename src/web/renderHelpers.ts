import type { Action, DirectivesOutput, Status, Step, Vec3 } from "../types.js";

export const STATUS_ORDER: Status[] = ["ok", "pending", "clamped", "blocked", "needs_review"];

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export function formatNumber(value: unknown, digits = 2): string {
  const numeric = toNumber(value);
  if (numeric === undefined) return "—";
  return numeric.toFixed(digits);
}

export function formatVec3(value: unknown, digits = 2): string {
  if (!Array.isArray(value) || value.length !== 3) return "—";
  return value.map((component) => formatNumber(component, digits)).join(", ");
}

export function formatConfidence(confidence?: number): string {
  const numeric = toNumber(confidence);
  if (numeric === undefined) return "—";
  return `${(numeric * 100).toFixed(1)}%`;
}

export function normalizeCounts(summary?: DirectivesOutput["summary"]): Record<Status, number> {
  const counts = summary?.counts_by_status ?? {};
  return STATUS_ORDER.reduce((acc, status) => {
    const value = toNumber((counts as Record<string, unknown>)[status]);
    acc[status] = value === undefined ? 0 : Math.max(0, Math.round(value));
    return acc;
  }, {} as Record<Status, number>);
}

export function formatStatusLabel(status: Status): string {
  switch (status) {
    case "needs_review":
      return "Needs review";
    case "ok":
      return "OK";
    default:
      return status.replace(/_/g, " ");
  }
}

export function formatExpectedResult(result?: "expected_pass" | "expected_fail" | "unknown"): string {
  switch (result) {
    case "expected_pass":
      return "Expected pass";
    case "expected_fail":
      return "Expected fail";
    default:
      return "Unknown";
  }
}

export function getPrimaryAction(step: Step): Action | undefined {
  if (!step.actions || step.actions.length === 0) return undefined;
  return step.actions.find((action) => action.type !== "noop") ?? step.actions[0];
}

export function formatActionSummary(action?: Action): string {
  if (!action) return "No action";
  switch (action.type) {
    case "translate":
      return `Translate by [${formatVec3(action.delta?.translation_mm, 1)}] mm`;
    case "rotate":
      return `Rotate about ${action.axis?.toUpperCase() ?? "?"} axis`;
    case "rotate_to_index":
      return `Rotate to index ${action.target_index ?? "?"}`;
    case "noop":
      return "No action";
    default:
      return "Action";
  }
}

export function formatErrorSummary(step: Step): string {
  const translation = formatVec3(step.computed_errors?.translation_error_mm_vec, 1);
  const rotation = formatNumber(step.computed_errors?.rotation_error_deg, 1);
  return `${translation} mm · ${rotation}°`;
}
