/**
 * Deep-link routing module for Directive Engine demo
 *
 * Parses URL query parameters to control:
 * - dataset: which dataset to load (toy|museum)
 * - mode: view mode (viewer|runbook|step|overlay)
 * - part: selected part ID
 */

export type DemoDataset = "toy" | "museum";
export type DemoMode = "viewer" | "runbook" | "step" | "overlay";

export interface RouteState {
  dataset: DemoDataset;
  mode: DemoMode;
  part: string | null;
}

const VALID_DATASETS: DemoDataset[] = ["toy", "museum"];
const VALID_MODES: DemoMode[] = ["viewer", "runbook", "step", "overlay"];

/**
 * Parse URL search params to extract route state
 */
export function parseRouteFromUrl(): RouteState {
  const params = new URLSearchParams(window.location.search);

  // Parse dataset (default: toy)
  const rawDataset = params.get("dataset");
  const dataset: DemoDataset =
    rawDataset && VALID_DATASETS.includes(rawDataset as DemoDataset)
      ? (rawDataset as DemoDataset)
      : "toy";

  // Parse mode (default: viewer)
  const rawMode = params.get("mode");
  const mode: DemoMode =
    rawMode && VALID_MODES.includes(rawMode as DemoMode)
      ? (rawMode as DemoMode)
      : "viewer";

  // Parse part (default: null - no selection)
  const part = params.get("part") || null;

  return { dataset, mode, part };
}

/**
 * Update URL to reflect current route state without triggering a page reload
 */
export function updateUrlFromState(state: RouteState): void {
  const params = new URLSearchParams();

  // Only add params that differ from defaults to keep URLs clean
  if (state.dataset !== "toy") {
    params.set("dataset", state.dataset);
  }
  if (state.mode !== "viewer") {
    params.set("mode", state.mode);
  }
  if (state.part) {
    params.set("part", state.part);
  }

  const search = params.toString();
  const newUrl = search
    ? `${window.location.pathname}?${search}`
    : window.location.pathname;

  window.history.replaceState(null, "", newUrl);
}

/**
 * Get a shareable URL for the current route state
 */
export function getShareableUrl(state: RouteState): string {
  const params = new URLSearchParams();

  // Always include all params for shareable URLs
  params.set("dataset", state.dataset);
  params.set("mode", state.mode);
  if (state.part) {
    params.set("part", state.part);
  }

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * Create a route state object
 */
export function createRouteState(
  dataset: DemoDataset,
  mode: DemoMode,
  part: string | null = null
): RouteState {
  return { dataset, mode, part };
}

/**
 * Check if two route states are equal
 */
export function routeStatesEqual(a: RouteState, b: RouteState): boolean {
  return a.dataset === b.dataset && a.mode === b.mode && a.part === b.part;
}
