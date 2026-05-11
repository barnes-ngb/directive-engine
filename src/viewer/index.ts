/**
 * Viewer entry point: scene + 5-beat narrative.
 *
 * Wires together:
 *   - Three.js scene with proxy panel meshes (Phase 1)
 *   - `BeatController` state machine (Phase 2)
 *   - DOM overlay: headline, directive card, verification panel, beat-nav (Phase 2)
 *   - Engine call through `generateDirectives()` (Phase 2)
 *
 * Phase 2 transitions are snaps — no animation, no DOF ghosts, no arrows.
 * Those land in Phase 3.
 */

import * as THREE from "three";
import { createScene, type SceneHandle } from "./scene.js";
import { buildPanelMesh, applyPose, DEFAULT_PANEL_DIMENSIONS } from "./panel-mesh.js";
import { loadToyFacadeFixture, type FacadeFixture, type FacadePart } from "./load-fixture.js";
import { BeatController, type Beat, type BeatState } from "./beat-controller.js";
import { buildEngineBundle, pickFocusedPart, type EngineBundle } from "./engine-bridge.js";
import { mountOverlay, type OverlayHandle } from "./overlay/index.js";

/** Tolerance band for "deviated" panel highlighting (mm). */
const DEVIATED_SEVERE_MM = 5.0;
const DIM_OPACITY = 0.25;

export interface MountedViewer {
  scene: SceneHandle;
  fixture: FacadeFixture;
  controller: BeatController;
  bundle: EngineBundle;
  /** Tear down GPU resources, overlay listeners, and remove DOM elements. */
  dispose: () => void;
}

interface PanelHandle {
  partId: string;
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  /** Original colour for resetting highlight states. */
  baseColor: THREE.Color;
}

export function mountViewer(container: HTMLElement): MountedViewer {
  // Container must be a positioning context so the overlay can absolute-position.
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const fixture = loadToyFacadeFixture();
  const bundle = buildEngineBundle(fixture);
  const bounds = computePanelBounds(fixture);
  const focusedPartId = pickFocusedPart(bundle);

  const scene = createScene({
    container,
    lookAt: bounds.center,
    cameraPosition: deriveCameraPosition(bounds),
    transparent: true,
  });

  const panels = new Map<string, PanelHandle>();
  for (const part of fixture.parts) {
    const handle = mountPanel(part, scene);
    panels.set(part.partId, handle);
  }

  scene.contentRoot.add(buildGroundPlane(bounds));

  const controller = new BeatController({ focusedPartId });

  // Cache the wide-shot camera state so we can restore it on prev/restart.
  const wideShot = {
    position: scene.camera.position.clone(),
    target: scene.controls.target.clone(),
  };

  const applyBeatToScene = (state: BeatState): void => {
    applyHighlights(panels, bundle, state);
    applyPanelPoses(panels, fixture, bundle, state);
    applyCamera(state, scene, bounds, panels, wideShot);
  };

  controller.on((current) => {
    applyBeatToScene(current);
  });
  applyBeatToScene(controller.current);

  const overlay = mountOverlay({
    host: container,
    controller,
    bundle,
    onApply: () => {
      // Scene apply effect is driven by the beat transition listener;
      // nothing else to do here for Phase 2 (snap, not animation).
    },
    onRestart: () => {
      // Controller.reset() goes to beat 1; the scene listener picks it up.
    },
  });

  return {
    scene,
    fixture,
    controller,
    bundle,
    dispose: () => {
      overlay.dispose();
      if (overlay.element.parentElement === container) {
        container.removeChild(overlay.element);
      }
      scene.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

function mountPanel(part: FacadePart, scene: SceneHandle): PanelHandle {
  // Render the panel at its as-built pose for beat 1 (deviation visible);
  // we'll snap to corrected pose at beat 4. If as-built is missing, fall
  // back to the nominal pose.
  const startPose = part.asBuilt ?? part.nominal;
  const group = buildPanelMesh({
    partId: part.partId,
    pose: startPose,
    dimensions: DEFAULT_PANEL_DIMENSIONS,
  });
  scene.contentRoot.add(group);
  const mesh = group.children[0] as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.transparent = true;
  return {
    partId: part.partId,
    group,
    material,
    baseColor: material.color.clone(),
  };
}

// ---------------------------------------------------------------------------
// Per-beat effects
// ---------------------------------------------------------------------------

function applyHighlights(
  panels: Map<string, PanelHandle>,
  bundle: EngineBundle,
  state: BeatState,
): void {
  for (const handle of panels.values()) {
    const step = bundle.stepByPartId.get(handle.partId);
    const dev = step?.computed_errors.translation_error_norm_mm ?? 0;

    // Beat 2/3: dim everything except the focused panel.
    const isFocused = handle.partId === state.focusedPartId;
    const dimmed = (state.beat === 2 || state.beat === 3) && !isFocused;

    handle.material.opacity = dimmed ? DIM_OPACITY : 1.0;

    // Beat 1: tint deviated panels by severity.
    if (state.beat === 1 && step && step.status !== "ok") {
      const severe = dev >= DEVIATED_SEVERE_MM;
      handle.material.color.set(severe ? 0xef4444 : 0xfacc15);
      handle.material.emissive.set(severe ? 0x4a1a1a : 0x4a3a10);
    } else if (state.beat >= 4 || step?.status === "ok") {
      // After apply: deviated panels return to base colour (now in tolerance).
      handle.material.color.copy(handle.baseColor);
      handle.material.emissive.set(0x000000);
    } else {
      // Beats 2/3: keep deviated panel tinted for context, others base.
      // (step is known non-ok in this branch by the earlier `step?.status === "ok"` check.)
      if (isFocused && step) {
        handle.material.color.set(0xfacc15);
        handle.material.emissive.set(0x4a3a10);
      } else {
        handle.material.color.copy(handle.baseColor);
        handle.material.emissive.set(0x000000);
      }
    }
  }
}

function applyPanelPoses(
  panels: Map<string, PanelHandle>,
  fixture: FacadeFixture,
  bundle: EngineBundle,
  state: BeatState,
): void {
  for (const part of fixture.parts) {
    const handle = panels.get(part.partId);
    if (!handle) continue;
    const applied = state.beat >= 4;
    const pose = applied
      ? correctedPoseFor(part, bundle)
      : part.asBuilt ?? part.nominal;
    applyPose(handle.group, pose);
  }
}

function correctedPoseFor(part: FacadePart, bundle: EngineBundle): { t: [number, number, number]; q: [number, number, number, number] } {
  const step = bundle.stepByPartId.get(part.partId);
  // For Phase 2, "applied" means the panel reaches its nominal pose for
  // non-clamped corrections. If clamped or blocked, fall back to as-built
  // plus the engine's emitted translation delta (no full closure).
  if (!step || step.status === "ok") {
    return part.nominal;
  }
  if (step.status === "blocked") {
    return part.asBuilt ?? part.nominal;
  }
  if (step.status === "clamped") {
    // as-built + engine's (clamped) translation delta in world frame.
    const ab = part.asBuilt ?? part.nominal;
    const translate = step.actions.find((a) => a.type === "translate");
    const dt = translate?.delta?.translation_mm ?? [0, 0, 0];
    return {
      t: [ab.t[0] + dt[0], ab.t[1] + dt[1], ab.t[2] + dt[2]],
      q: part.nominal.q,
    };
  }
  // pending — full correction reaches nominal.
  return part.nominal;
}

function applyCamera(
  state: BeatState,
  scene: SceneHandle,
  bounds: PanelBounds,
  panels: Map<string, PanelHandle>,
  wideShot: { position: THREE.Vector3; target: THREE.Vector3 },
): void {
  // Beat 1: wide shot. Beats 2-4: close on focused panel. Beat 5: wide shot.
  const wantClose = state.beat >= 2 && state.beat <= 4;
  if (!wantClose || !state.focusedPartId) {
    scene.camera.position.copy(wideShot.position);
    scene.controls.target.copy(wideShot.target);
    scene.controls.update();
    return;
  }
  const focused = panels.get(state.focusedPartId);
  if (!focused) return;
  const target = focused.group.position.clone();
  const radius =
    Math.max(DEFAULT_PANEL_DIMENSIONS.widthMm, DEFAULT_PANEL_DIMENSIONS.heightMm) * 3.2;
  scene.camera.position.set(
    target.x + radius * 0.55,
    target.y + radius * 0.35,
    target.z + radius * 0.85,
  );
  scene.controls.target.copy(target);
  scene.controls.update();
  // Silence unused-bounds warning when not used in close-up branch.
  void bounds;
}

// ---------------------------------------------------------------------------
// Bounds + camera framing (carried forward from Phase 1)
// ---------------------------------------------------------------------------

interface PanelBounds {
  center: THREE.Vector3;
  spanX: number;
  spanY: number;
}

function computePanelBounds(fixture: FacadeFixture): PanelBounds {
  if (fixture.parts.length === 0) {
    return { center: new THREE.Vector3(), spanX: 1, spanY: 1 };
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of fixture.parts) {
    const [x, y, z] = p.nominal.t;
    min.min(new THREE.Vector3(x, y, z));
    max.max(new THREE.Vector3(x, y, z));
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  const spanX = Math.max(max.x - min.x, DEFAULT_PANEL_DIMENSIONS.widthMm);
  const spanY = Math.max(max.y - min.y, DEFAULT_PANEL_DIMENSIONS.heightMm);
  return { center, spanX, spanY };
}

function deriveCameraPosition(bounds: PanelBounds): THREE.Vector3 {
  const radius = Math.max(bounds.spanX, bounds.spanY) * 1.8 + 2500;
  return new THREE.Vector3(
    bounds.center.x + radius * 0.7,
    bounds.center.y + radius * 0.4,
    bounds.center.z + radius * 0.7,
  );
}

function buildGroundPlane(bounds: PanelBounds): THREE.Object3D {
  const groundSize = Math.max(bounds.spanX, bounds.spanY) * 6 + 10_000;
  const geom = new THREE.PlaneGeometry(groundSize, groundSize);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe6e8eb,
    metalness: 0.0,
    roughness: 0.95,
  });
  const plane = new THREE.Mesh(geom, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = bounds.center.y - DEFAULT_PANEL_DIMENSIONS.heightMm * 0.6;
  plane.receiveShadow = true;
  plane.name = "ground";
  return plane;
}

export type { OverlayHandle };
