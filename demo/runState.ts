/**
 * Run state persistence module for Directive Engine
 *
 * Stores run progress in localStorage with key format:
 *   directive_engine_runstate::<dataset_id>
 *
 * Each step tracks:
 * - completed: boolean
 * - completed_at: ISO timestamp
 * - escalated: boolean (for blocked/needs_review parts that were escalated)
 * - notes: optional user notes
 * - sim_pass: optional simulation pass/fail result
 * - sim_after_translation_norm_mm: optional post-simulation translation error
 * - sim_after_rotation_deg: optional post-simulation rotation error
 */

/** Individual step completion record */
export interface StepCompletion {
  completed: boolean;
  completed_at?: string;
  escalated?: boolean;
  notes?: string;
  sim_pass?: boolean;
  sim_after_translation_norm_mm?: number;
  sim_after_rotation_deg?: number;
}

/** Full run state for a dataset */
export interface RunState {
  dataset_id: string;
  updated_at: string;
  steps: Record<string, StepCompletion>;
}

const STORAGE_KEY_PREFIX = "directive_engine_runstate::";

/**
 * Get storage key for a dataset
 */
function getStorageKey(datasetId: string): string {
  return `${STORAGE_KEY_PREFIX}${datasetId}`;
}

/**
 * Load run state from localStorage
 */
export function loadRunState(datasetId: string): RunState | null {
  try {
    const key = getStorageKey(datasetId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as RunState;
    // Validate basic structure
    if (
      typeof parsed.dataset_id !== "string" ||
      typeof parsed.steps !== "object"
    ) {
      console.warn(`Invalid run state for ${datasetId}, ignoring`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to load run state for ${datasetId}:`, error);
    return null;
  }
}

/**
 * Save run state to localStorage
 */
export function saveRunState(state: RunState): void {
  try {
    const key = getStorageKey(state.dataset_id);
    state.updated_at = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn(`Failed to save run state for ${state.dataset_id}:`, error);
  }
}

/**
 * Create a new empty run state for a dataset
 */
export function createRunState(datasetId: string): RunState {
  return {
    dataset_id: datasetId,
    updated_at: new Date().toISOString(),
    steps: {}
  };
}

/**
 * Get or create run state for a dataset
 */
export function getOrCreateRunState(datasetId: string): RunState {
  return loadRunState(datasetId) ?? createRunState(datasetId);
}

/**
 * Get completion status for a specific part
 */
export function getStepCompletion(
  state: RunState,
  partId: string
): StepCompletion | null {
  return state.steps[partId] ?? null;
}

/**
 * Mark a step as completed
 */
export function markStepCompleted(
  state: RunState,
  partId: string,
  options?: {
    notes?: string;
    sim_pass?: boolean;
    sim_after_translation_norm_mm?: number;
    sim_after_rotation_deg?: number;
    escalated?: boolean;
  }
): RunState {
  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: {
      ...state.steps,
      [partId]: {
        completed: true,
        completed_at: new Date().toISOString(),
        ...(options?.notes !== undefined && { notes: options.notes }),
        ...(options?.sim_pass !== undefined && { sim_pass: options.sim_pass }),
        ...(options?.sim_after_translation_norm_mm !== undefined && {
          sim_after_translation_norm_mm: options.sim_after_translation_norm_mm
        }),
        ...(options?.sim_after_rotation_deg !== undefined && {
          sim_after_rotation_deg: options.sim_after_rotation_deg
        }),
        ...(options?.escalated !== undefined && { escalated: options.escalated })
      }
    }
  };
  saveRunState(updated);
  return updated;
}

/**
 * Mark a step as not completed (reset)
 */
export function markStepIncomplete(state: RunState, partId: string): RunState {
  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: {
      ...state.steps,
      [partId]: {
        completed: false
      }
    }
  };
  saveRunState(updated);
  return updated;
}

/**
 * Mark a step as escalated (for blocked/needs_review parts)
 */
export function markStepEscalated(
  state: RunState,
  partId: string,
  notes: string
): RunState {
  const existing = state.steps[partId] ?? { completed: false };
  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: {
      ...state.steps,
      [partId]: {
        ...existing,
        escalated: true,
        notes
      }
    }
  };
  saveRunState(updated);
  return updated;
}

/**
 * Reset a single step (clear all completion data)
 */
export function resetStep(state: RunState, partId: string): RunState {
  const newSteps = { ...state.steps };
  delete newSteps[partId];
  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: newSteps
  };
  saveRunState(updated);
  return updated;
}

/**
 * Reset entire run (clear all steps)
 */
export function resetRun(datasetId: string): RunState {
  const newState = createRunState(datasetId);
  saveRunState(newState);
  return newState;
}

/**
 * Update notes for a step
 */
export function updateStepNotes(
  state: RunState,
  partId: string,
  notes: string
): RunState {
  const existing = state.steps[partId] ?? {
    completed: false
  };

  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: {
      ...state.steps,
      [partId]: {
        ...existing,
        notes
      }
    }
  };
  saveRunState(updated);
  return updated;
}

/**
 * Update simulation result for a step
 */
export function updateStepSimulation(
  state: RunState,
  partId: string,
  sim_pass: boolean,
  sim_after_translation_norm_mm: number,
  sim_after_rotation_deg: number
): RunState {
  const existing = state.steps[partId] ?? {
    completed: false
  };

  const updated: RunState = {
    ...state,
    updated_at: new Date().toISOString(),
    steps: {
      ...state.steps,
      [partId]: {
        ...existing,
        sim_pass,
        sim_after_translation_norm_mm,
        sim_after_rotation_deg
      }
    }
  };
  saveRunState(updated);
  return updated;
}

/**
 * Get count of completed steps
 */
export function getCompletedCount(state: RunState): number {
  return Object.values(state.steps).filter((s) => s.completed).length;
}

/**
 * Get progress summary for a list of parts
 */
export function getProgressSummary(
  state: RunState,
  partIds: string[]
): { completed: number; total: number; percent: number; escalated: number } {
  const total = partIds.length;
  const completed = partIds.filter(
    (id) => state.steps[id]?.completed
  ).length;
  const escalated = partIds.filter(
    (id) => state.steps[id]?.escalated
  ).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percent, escalated };
}

/**
 * Clear all run state for a dataset
 */
export function clearRunState(datasetId: string): void {
  try {
    const key = getStorageKey(datasetId);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to clear run state for ${datasetId}:`, error);
  }
}

/**
 * Export run state as JSON string
 */
export function exportRunState(state: RunState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Import run state from JSON string
 */
export function importRunState(json: string, datasetId: string): RunState | null {
  try {
    const parsed = JSON.parse(json) as RunState;
    if (parsed.dataset_id !== datasetId) {
      console.warn(
        `Imported run state dataset_id mismatch: expected ${datasetId}, got ${parsed.dataset_id}`
      );
      return null;
    }
    saveRunState(parsed);
    return parsed;
  } catch (error) {
    console.warn("Failed to import run state:", error);
    return null;
  }
}
