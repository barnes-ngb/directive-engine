/**
 * Phone Overlay Mode - Camera-backed 2D overlay for per-part directives
 *
 * Features:
 * - Video background from device camera (with fallback to neutral background)
 * - Part ID and status display
 * - Translation delta arrow with magnitude (screen-space)
 * - PASS/FAIL simulation badge or "Run simulation" prompt
 * - Mark Complete functionality (requires sim pass OR note)
 */

import type { SimulationResult } from "../src/core/index.js";
import type { Step, Vec3, Status } from "../src/types.js";
import { formatResidual } from "./summary.js";

export interface OverlayState {
  isOpen: boolean;
  cameraGranted: boolean;
  videoStream: MediaStream | null;
  partId: string | null;
  partName: string | null;
  step: Step | null;
  simulationResult: SimulationResult | null;
  completedParts: Map<string, { note?: string; simPassed: boolean }>;
}

export interface OverlayCallbacks {
  onSimulate: (partId: string) => SimulationResult | null;
  onClose: () => void;
  onMarkComplete: (partId: string, note: string | null, simPassed: boolean) => void;
}

let overlayState: OverlayState = {
  isOpen: false,
  cameraGranted: false,
  videoStream: null,
  partId: null,
  partName: null,
  step: null,
  simulationResult: null,
  completedParts: new Map()
};

let callbacks: OverlayCallbacks | null = null;

// DOM Elements
let overlayContainer: HTMLDivElement | null = null;
let videoElement: HTMLVideoElement | null = null;

/**
 * Initialize the overlay mode with callbacks
 */
export function initOverlay(cb: OverlayCallbacks): void {
  callbacks = cb;
  createOverlayElements();
}

/**
 * Create the overlay DOM elements
 */
function createOverlayElements(): void {
  // Create overlay container if it doesn't exist
  overlayContainer = document.getElementById("phone-overlay") as HTMLDivElement;
  if (!overlayContainer) {
    overlayContainer = document.createElement("div");
    overlayContainer.id = "phone-overlay";
    overlayContainer.className = "phone-overlay";
    overlayContainer.hidden = true;
    document.body.appendChild(overlayContainer);
  }
}

/**
 * Open the overlay mode for a specific part
 */
export async function openOverlay(
  partId: string,
  partName: string,
  step: Step,
  simulationResult: SimulationResult | null
): Promise<void> {
  if (!overlayContainer) return;

  overlayState.isOpen = true;
  overlayState.partId = partId;
  overlayState.partName = partName;
  overlayState.step = step;
  overlayState.simulationResult = simulationResult;

  overlayContainer.hidden = false;
  document.body.classList.add("overlay-active");

  // Try to get camera access
  await requestCameraAccess();

  // Render the overlay content
  renderOverlay();
}

/**
 * Close the overlay mode
 */
export function closeOverlay(): void {
  if (!overlayContainer) return;

  overlayState.isOpen = false;
  overlayContainer.hidden = true;
  document.body.classList.remove("overlay-active");

  // Stop the video stream
  stopCamera();

  if (callbacks?.onClose) {
    callbacks.onClose();
  }
}

/**
 * Request camera access
 */
async function requestCameraAccess(): Promise<void> {
  try {
    // Request rear camera for mobile devices
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    overlayState.videoStream = stream;
    overlayState.cameraGranted = true;
  } catch (error) {
    console.warn("Camera access denied or unavailable:", error);
    overlayState.cameraGranted = false;
    overlayState.videoStream = null;
  }
}

/**
 * Stop the camera stream
 */
function stopCamera(): void {
  if (overlayState.videoStream) {
    overlayState.videoStream.getTracks().forEach(track => track.stop());
    overlayState.videoStream = null;
  }
}

/**
 * Format status label
 */
function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

/**
 * Compute the 2D arrow direction and magnitude for translation delta
 * Maps 3D world translation to 2D screen space (simplified projection)
 */
function computeArrowData(translationVec: Vec3): { angle: number; magnitude: number; label: string } {
  const [x, y, z] = translationVec;

  // Screen-space mapping:
  // X -> horizontal (right positive)
  // Y -> vertical (up positive, but screen is down positive)
  // Z -> depth (ignored for 2D, but shown in magnitude)

  // Use X and Y for the 2D arrow direction
  const screenX = x;
  const screenY = -y; // Invert Y for screen coordinates

  // Calculate angle in radians, then convert to degrees
  const angle = Math.atan2(screenY, screenX) * (180 / Math.PI);

  // Calculate 3D magnitude
  const magnitude = Math.sqrt(x * x + y * y + z * z);

  // Create label showing all components
  const label = `[${formatResidual(x)}, ${formatResidual(y)}, ${formatResidual(z)}] mm`;

  return { angle, magnitude, label };
}

/**
 * Render the overlay content
 */
function renderOverlay(): void {
  if (!overlayContainer || !overlayState.step) return;

  const { partId, partName, step, simulationResult, cameraGranted } = overlayState;
  const completionInfo = overlayState.completedParts.get(partId ?? "");
  const isCompleted = !!completionInfo;

  // Determine simulation status
  const hasSimulation = simulationResult !== null;
  const simPassed = simulationResult?.pass ?? false;
  const canSimulate = step.status !== "blocked" && step.status !== "needs_review";

  // Calculate arrow data from translation error or directive delta
  let arrowHtml = "";
  if (step.computed_errors.translation_error_norm_mm > 0.01) {
    const arrowData = computeArrowData(step.computed_errors.translation_error_mm_vec);
    const arrowRotation = arrowData.angle;

    arrowHtml = `
      <div class="overlay-arrow-container">
        <div class="overlay-arrow" style="transform: rotate(${arrowRotation}deg)">
          <svg viewBox="0 0 100 40" width="120" height="48">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="currentColor"/>
              </marker>
            </defs>
            <line x1="10" y1="20" x2="80" y2="20" stroke="currentColor" stroke-width="4" marker-end="url(#arrowhead)"/>
          </svg>
        </div>
        <div class="overlay-arrow-label">
          <span class="overlay-arrow-magnitude">${formatResidual(arrowData.magnitude)} mm</span>
          <span class="overlay-arrow-vector">${arrowData.label}</span>
        </div>
      </div>
    `;
  }

  // Simulation status display
  let simStatusHtml: string;
  if (!canSimulate) {
    simStatusHtml = `
      <div class="overlay-sim-status overlay-sim-na">
        <span class="overlay-sim-badge">N/A</span>
        <span class="overlay-sim-text">Cannot simulate: ${formatStatusLabel(step.status)}</span>
      </div>
    `;
  } else if (!hasSimulation) {
    simStatusHtml = `
      <div class="overlay-sim-status overlay-sim-pending">
        <span class="overlay-sim-badge">?</span>
        <span class="overlay-sim-text">Run simulation</span>
      </div>
    `;
  } else {
    simStatusHtml = `
      <div class="overlay-sim-status ${simPassed ? "overlay-sim-pass" : "overlay-sim-fail"}">
        <span class="overlay-sim-badge">${simPassed ? "PASS" : "FAIL"}</span>
        <span class="overlay-sim-text">${simPassed ? "Within tolerance" : "Out of tolerance"}</span>
      </div>
    `;
  }

  // Completion status
  let completionHtml = "";
  if (isCompleted) {
    completionHtml = `
      <div class="overlay-completion">
        <span class="overlay-completion-badge">COMPLETED</span>
        ${completionInfo.note ? `<span class="overlay-completion-note">${completionInfo.note}</span>` : ""}
      </div>
    `;
  }

  overlayContainer.innerHTML = `
    <div class="overlay-background ${cameraGranted ? "overlay-camera" : "overlay-neutral"}">
      ${cameraGranted ? '<video id="overlay-video" autoplay playsinline muted></video>' : ""}
    </div>

    <div class="overlay-content">
      <div class="overlay-header">
        <div class="overlay-part-info">
          <h2 class="overlay-part-name">${partName ?? partId}</h2>
          <span class="overlay-part-id">Part ${partId}</span>
        </div>
        <span class="badge overlay-status ${step.status}">${formatStatusLabel(step.status)}</span>
      </div>

      ${arrowHtml}

      ${simStatusHtml}

      ${completionHtml}

      <div class="overlay-actions">
        <button class="overlay-button overlay-button-back" type="button" id="overlay-back">
          <span class="overlay-button-icon">&#x2190;</span>
          Back to Step
        </button>

        <button class="overlay-button overlay-button-simulate ${hasSimulation ? "simulated" : ""}"
                type="button"
                id="overlay-simulate"
                ${!canSimulate ? "disabled" : ""}>
          ${hasSimulation ? "Re-simulate" : "Simulate Apply"}
        </button>

        <button class="overlay-button overlay-button-complete ${isCompleted ? "completed" : ""}"
                type="button"
                id="overlay-complete">
          ${isCompleted ? "Completed" : "Mark Complete"}
        </button>
      </div>
    </div>
  `;

  // Set up video element if camera is granted
  if (cameraGranted && overlayState.videoStream) {
    videoElement = document.getElementById("overlay-video") as HTMLVideoElement;
    if (videoElement) {
      videoElement.srcObject = overlayState.videoStream;
    }
  }

  // Attach event listeners
  attachEventListeners();
}

/**
 * Attach event listeners to overlay buttons
 */
function attachEventListeners(): void {
  const backButton = document.getElementById("overlay-back");
  const simulateButton = document.getElementById("overlay-simulate");
  const completeButton = document.getElementById("overlay-complete");

  if (backButton) {
    backButton.addEventListener("click", () => {
      closeOverlay();
    });
  }

  if (simulateButton && !simulateButton.hasAttribute("disabled")) {
    simulateButton.addEventListener("click", () => {
      if (overlayState.partId && callbacks?.onSimulate) {
        const result = callbacks.onSimulate(overlayState.partId);
        overlayState.simulationResult = result;
        renderOverlay();
      }
    });
  }

  if (completeButton) {
    completeButton.addEventListener("click", () => {
      handleMarkComplete();
    });
  }
}

/**
 * Handle the Mark Complete action
 * Requires simulation pass OR a note
 */
function handleMarkComplete(): void {
  if (!overlayState.partId || !overlayState.step) return;

  const partId = overlayState.partId;
  const simPassed = overlayState.simulationResult?.pass ?? false;
  const canSimulate = overlayState.step.status !== "blocked" && overlayState.step.status !== "needs_review";

  // Check if already completed
  if (overlayState.completedParts.has(partId)) {
    // Already completed - could show a message or allow uncomplete
    return;
  }

  // If simulation passed, mark complete immediately
  if (simPassed) {
    overlayState.completedParts.set(partId, { simPassed: true });
    if (callbacks?.onMarkComplete) {
      callbacks.onMarkComplete(partId, null, true);
    }
    renderOverlay();
    return;
  }

  // If simulation not run or failed, require a note
  const note = prompt(
    canSimulate && !overlayState.simulationResult
      ? "Simulation not run. Please provide a note to complete without simulation:"
      : "Simulation failed. Please provide a note to complete anyway:"
  );

  if (note && note.trim().length > 0) {
    overlayState.completedParts.set(partId, { note: note.trim(), simPassed: false });
    if (callbacks?.onMarkComplete) {
      callbacks.onMarkComplete(partId, note.trim(), false);
    }
    renderOverlay();
  }
  // If no note provided, don't mark as complete
}

/**
 * Update the overlay with new simulation result
 */
export function updateOverlaySimulation(result: SimulationResult | null): void {
  overlayState.simulationResult = result;
  if (overlayState.isOpen) {
    renderOverlay();
  }
}

/**
 * Check if overlay is currently open
 */
export function isOverlayOpen(): boolean {
  return overlayState.isOpen;
}

/**
 * Get the completed parts map
 */
export function getCompletedParts(): Map<string, { note?: string; simPassed: boolean }> {
  return overlayState.completedParts;
}

/**
 * Clear a specific part's completion status
 */
export function clearPartCompletion(partId: string): void {
  overlayState.completedParts.delete(partId);
}

/**
 * Clear all completion statuses
 */
export function clearAllCompletions(): void {
  overlayState.completedParts.clear();
}
