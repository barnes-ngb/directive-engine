/**
 * Anchor exclude state persistence module for Directive Engine
 *
 * Stores anchor include/exclude state in localStorage with key format:
 *   directive_engine_anchor_excludes::<dataset_id>
 *
 * Tracks which anchors should be excluded from calibration alignment.
 */

/** State for anchor exclusions */
export interface AnchorExcludeState {
  dataset_id: string;
  updated_at: string;
  /** Set of excluded anchor IDs (anchors not in this set are included) */
  excluded_anchor_ids: string[];
}

const STORAGE_KEY_PREFIX = "directive_engine_anchor_excludes::";

/**
 * Get storage key for a dataset
 */
function getStorageKey(datasetId: string): string {
  return `${STORAGE_KEY_PREFIX}${datasetId}`;
}

/**
 * Load anchor exclude state from localStorage
 */
export function loadAnchorExcludeState(datasetId: string): AnchorExcludeState | null {
  try {
    const key = getStorageKey(datasetId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as AnchorExcludeState;
    // Validate basic structure
    if (
      typeof parsed.dataset_id !== "string" ||
      !Array.isArray(parsed.excluded_anchor_ids)
    ) {
      console.warn(`Invalid anchor exclude state for ${datasetId}, ignoring`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to load anchor exclude state for ${datasetId}:`, error);
    return null;
  }
}

/**
 * Save anchor exclude state to localStorage
 */
export function saveAnchorExcludeState(state: AnchorExcludeState): void {
  try {
    const key = getStorageKey(state.dataset_id);
    state.updated_at = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn(`Failed to save anchor exclude state for ${state.dataset_id}:`, error);
  }
}

/**
 * Create a new empty anchor exclude state for a dataset
 */
export function createAnchorExcludeState(datasetId: string): AnchorExcludeState {
  return {
    dataset_id: datasetId,
    updated_at: new Date().toISOString(),
    excluded_anchor_ids: []
  };
}

/**
 * Get or create anchor exclude state for a dataset
 */
export function getOrCreateAnchorExcludeState(datasetId: string): AnchorExcludeState {
  return loadAnchorExcludeState(datasetId) ?? createAnchorExcludeState(datasetId);
}

/**
 * Check if an anchor is included (not excluded)
 */
export function isAnchorIncluded(state: AnchorExcludeState, anchorId: string): boolean {
  return !state.excluded_anchor_ids.includes(anchorId);
}

/**
 * Get set of included anchor IDs from a list of all anchor IDs
 */
export function getIncludedAnchorIds(state: AnchorExcludeState, allAnchorIds: string[]): string[] {
  return allAnchorIds.filter((id) => !state.excluded_anchor_ids.includes(id));
}

/**
 * Toggle an anchor's include state
 * Returns the updated state
 */
export function toggleAnchorInclude(
  state: AnchorExcludeState,
  anchorId: string
): AnchorExcludeState {
  const isCurrentlyExcluded = state.excluded_anchor_ids.includes(anchorId);

  const updated: AnchorExcludeState = {
    ...state,
    updated_at: new Date().toISOString(),
    excluded_anchor_ids: isCurrentlyExcluded
      ? state.excluded_anchor_ids.filter((id) => id !== anchorId)
      : [...state.excluded_anchor_ids, anchorId]
  };

  saveAnchorExcludeState(updated);
  return updated;
}

/**
 * Set an anchor's include state explicitly
 * Returns the updated state
 */
export function setAnchorIncluded(
  state: AnchorExcludeState,
  anchorId: string,
  included: boolean
): AnchorExcludeState {
  const isCurrentlyIncluded = !state.excluded_anchor_ids.includes(anchorId);

  // No change needed
  if (isCurrentlyIncluded === included) {
    return state;
  }

  const updated: AnchorExcludeState = {
    ...state,
    updated_at: new Date().toISOString(),
    excluded_anchor_ids: included
      ? state.excluded_anchor_ids.filter((id) => id !== anchorId)
      : [...state.excluded_anchor_ids, anchorId]
  };

  saveAnchorExcludeState(updated);
  return updated;
}

/**
 * Reset all anchors to included state
 */
export function resetAnchorExcludes(datasetId: string): AnchorExcludeState {
  const newState = createAnchorExcludeState(datasetId);
  saveAnchorExcludeState(newState);
  return newState;
}

/**
 * Clear anchor exclude state for a dataset
 */
export function clearAnchorExcludeState(datasetId: string): void {
  try {
    const key = getStorageKey(datasetId);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to clear anchor exclude state for ${datasetId}:`, error);
  }
}
