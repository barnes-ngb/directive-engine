/**
 * Lightweight tracing infrastructure for debugging directive generation.
 *
 * Usage:
 * ```typescript
 * import { createTracer, noopTracer } from "./trace.js";
 *
 * // For debugging:
 * const tracer = createTracer(console.log);
 *
 * // For production (no overhead):
 * const tracer = noopTracer;
 * ```
 */

import type { Action, Status, Step, Vec3 } from "./types.js";

export interface TraceContext {
  /** Called when processing starts for a part */
  onPartStart?(partId: string, partName: string): void;

  /** Called when error computation completes */
  onErrorsComputed?(partId: string, translationMm: number, rotationDeg: number): void;

  /** Called when status is determined */
  onStatusDetermined?(partId: string, status: Status, reasonCodes: string[]): void;

  /** Called when an action is generated */
  onActionGenerated?(partId: string, action: Action): void;

  /** Called when clamping is applied */
  onClampApplied?(
    partId: string,
    type: "translation" | "rotation",
    original: Vec3 | number,
    clamped: Vec3 | number
  ): void;

  /** Called when a step is completed */
  onStepComplete?(step: Step): void;

  /** Called when all processing is complete */
  onComplete?(totalSteps: number, statusCounts: Record<Status, number>): void;
}

/**
 * No-op tracer that has zero overhead when tracing is disabled.
 */
export const noopTracer: TraceContext = {};

/**
 * Create a tracer that logs to a provided log function.
 */
export function createTracer(log: (message: string) => void): TraceContext {
  return {
    onPartStart(partId, partName) {
      log(`[TRACE] Processing part ${partId} (${partName})`);
    },

    onErrorsComputed(partId, translationMm, rotationDeg) {
      log(
        `[TRACE] ${partId}: errors computed - translation=${translationMm.toFixed(3)}mm, rotation=${rotationDeg.toFixed(3)}°`
      );
    },

    onStatusDetermined(partId, status, reasonCodes) {
      log(`[TRACE] ${partId}: status=${status}, reasons=[${reasonCodes.join(", ")}]`);
    },

    onActionGenerated(partId, action) {
      log(`[TRACE] ${partId}: action ${action.action_id} - ${action.type}: ${action.description}`);
    },

    onClampApplied(partId, type, original, clamped) {
      const formatValue = (v: Vec3 | number) =>
        Array.isArray(v) ? `[${v.map((x) => x.toFixed(2)).join(", ")}]` : v.toFixed(2);
      log(
        `[TRACE] ${partId}: ${type} clamped from ${formatValue(original)} to ${formatValue(clamped)}`
      );
    },

    onStepComplete(step) {
      log(
        `[TRACE] ${step.part_id}: step ${step.step_id} complete - ${step.actions.length} action(s), status=${step.status}`
      );
    },

    onComplete(totalSteps, statusCounts) {
      const summary = Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}=${count}`)
        .join(", ");
      log(`[TRACE] Complete: ${totalSteps} steps processed - ${summary}`);
    }
  };
}

/**
 * Create a tracer that collects events into an array for later inspection.
 */
export interface TraceEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export function createCollectorTracer(): {
  tracer: TraceContext;
  getEvents: () => TraceEvent[];
  clear: () => void;
} {
  const events: TraceEvent[] = [];

  const addEvent = (type: string, data: Record<string, unknown>) => {
    events.push({ type, timestamp: Date.now(), data });
  };

  const tracer: TraceContext = {
    onPartStart(partId, partName) {
      addEvent("part_start", { partId, partName });
    },

    onErrorsComputed(partId, translationMm, rotationDeg) {
      addEvent("errors_computed", { partId, translationMm, rotationDeg });
    },

    onStatusDetermined(partId, status, reasonCodes) {
      addEvent("status_determined", { partId, status, reasonCodes });
    },

    onActionGenerated(partId, action) {
      addEvent("action_generated", { partId, action });
    },

    onClampApplied(partId, type, original, clamped) {
      addEvent("clamp_applied", { partId, type, original, clamped });
    },

    onStepComplete(step) {
      addEvent("step_complete", { stepId: step.step_id, partId: step.part_id, status: step.status });
    },

    onComplete(totalSteps, statusCounts) {
      addEvent("complete", { totalSteps, statusCounts });
    }
  };

  return {
    tracer,
    getEvents: () => [...events],
    clear: () => {
      events.length = 0;
    }
  };
}

/**
 * Merge multiple tracers into one. Each event triggers all tracers.
 */
export function mergeTracers(...tracers: TraceContext[]): TraceContext {
  return {
    onPartStart(partId, partName) {
      for (const t of tracers) t.onPartStart?.(partId, partName);
    },
    onErrorsComputed(partId, translationMm, rotationDeg) {
      for (const t of tracers) t.onErrorsComputed?.(partId, translationMm, rotationDeg);
    },
    onStatusDetermined(partId, status, reasonCodes) {
      for (const t of tracers) t.onStatusDetermined?.(partId, status, reasonCodes);
    },
    onActionGenerated(partId, action) {
      for (const t of tracers) t.onActionGenerated?.(partId, action);
    },
    onClampApplied(partId, type, original, clamped) {
      for (const t of tracers) t.onClampApplied?.(partId, type, original, clamped);
    },
    onStepComplete(step) {
      for (const t of tracers) t.onStepComplete?.(step);
    },
    onComplete(totalSteps, statusCounts) {
      for (const t of tracers) t.onComplete?.(totalSteps, statusCounts);
    }
  };
}
