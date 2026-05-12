/**
 * Reset-view button: snaps the camera back to the current beat's default
 * waypoint. Useful after free-orbit drags the user out of the framing.
 *
 * The button is small, lives in the top-right of the canvas region (below
 * the fallback link), and is keyboard-accessible.
 */

export interface ResetViewHandle {
  element: HTMLButtonElement;
}

export interface ResetViewOptions {
  onReset: () => void;
}

export function createResetViewButton(opts: ResetViewOptions): ResetViewHandle {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "de-reset-view";
  btn.setAttribute("aria-label", "Reset camera to default view");
  btn.title = "Reset view";
  // Circular arrow glyph; the visible label is the title/aria-label so
  // screen readers and tooltips both get a real word, not just an icon.
  btn.innerHTML = `
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 10a7 7 0 1 0 2.05-4.95"></path>
      <path d="M3 3v4h4"></path>
    </svg>
    <span class="de-reset-view__label">Reset view</span>
  `;
  btn.addEventListener("click", () => opts.onReset());
  return { element: btn };
}
