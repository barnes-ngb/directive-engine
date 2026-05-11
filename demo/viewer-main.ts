import { mountViewer } from "../src/viewer/index.js";

const host = document.getElementById("viewer");
if (!host) {
  throw new Error("Expected #viewer mount point in DOM");
}

// Show a subtle loading splash while Three.js initializes. Removed after the
// scene mounts so we don't flash blank between paint and first render.
const loading = document.createElement("div");
loading.className = "de-loading";
loading.setAttribute("role", "status");
loading.setAttribute("aria-live", "polite");
const spinner = document.createElement("div");
spinner.className = "de-loading__spinner";
loading.appendChild(spinner);
const loadingLabel = document.createElement("p");
loadingLabel.textContent = "Loading walkthrough…";
loading.appendChild(loadingLabel);
host.appendChild(loading);

let viewer: ReturnType<typeof mountViewer> | null = null;
try {
  viewer = mountViewer(host);
} catch (err) {
  showError(err);
}

if (loading.parentElement) loading.parentElement.removeChild(loading);

// Hot-module reload: dispose the previous viewer before the next module
// instance mounts a fresh one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    viewer?.dispose();
  });
}

function showError(err: unknown): void {
  const message =
    err instanceof Error
      ? err.message
      : "The 3D walkthrough failed to start. Try reloading the page.";
  const wrap = document.createElement("div");
  wrap.className = "de-error";
  wrap.setAttribute("role", "alert");
  const card = document.createElement("div");
  card.className = "de-error__card";
  const title = document.createElement("h1");
  title.className = "de-error__title";
  title.textContent = "Couldn't load the demo";
  const body = document.createElement("p");
  body.className = "de-error__body";
  body.textContent = message;
  card.appendChild(title);
  card.appendChild(body);
  wrap.appendChild(card);
  host?.appendChild(wrap);
  console.error("[viewer] mount failed:", err);
}
