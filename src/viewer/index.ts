/**
 * Viewer entry point: scene + 5-beat narrative with Phase 3 animations.
 *
 * Wires together:
 *   - Three.js scene with proxy panel meshes (Phase 1)
 *   - `BeatController` state machine (Phase 2)
 *   - DOM overlay: headline, directive card, verification panel, beat-nav (Phase 2)
 *   - Engine call through `generateDirectives()` (Phase 2)
 *   - Deviation arrows, feature markers, DOF ghosts (Phase 3)
 *   - Camera, panel, and arrow tweens via the scene's per-frame hook (Phase 3)
 *
 * Animations follow a single rule: every transition has a tween that lands at
 * the correct end state regardless of frame timing. Cancelling a tween (e.g.,
 * user grabs OrbitControls or advances beats quickly) snaps to the end state
 * so the scene never drifts.
 */

import * as THREE from "three";
import { createScene, type SceneHandle } from "./scene.js";
import { buildPanelMesh, applyPose, DEFAULT_PANEL_DIMENSIONS } from "./panel-mesh.js";
import { loadToyFacadeFixture, type FacadeFixture, type FacadePart } from "./load-fixture.js";
import { BeatController, type Beat, type BeatState } from "./beat-controller.js";
import { buildEngineBundle, pickFocusedPart, type EngineBundle } from "./engine-bridge.js";
import { mountOverlay, type OverlayHandle } from "./overlay/index.js";
import { AnimRunner } from "./anim/runner.js";
import {
  DEFAULT_CAMERA_DURATION_MS,
  sampleCameraTween,
  snapshotCamera,
  type CameraWaypoint,
} from "./anim/camera-tween.js";
import {
  DEFAULT_PANEL_DURATION_MS,
  poseToState,
  samplePanelTween,
} from "./anim/panel-tween.js";
import {
  DEFAULT_ARROW_DURATION_MS,
  sampleArrowTween,
} from "./anim/arrow-tween.js";
import {
  buildDeviationArrows,
  setArrowScale,
  type DeviationArrowsHandle,
} from "./viz/deviation-arrows.js";
import {
  buildFeatureMarkers,
  type FeatureMarkersHandle,
} from "./viz/feature-markers.js";
import { buildDofGhosts, type DofGhostsHandle } from "./viz/dof-ghosts.js";
import {
  CLOSE_SHOT_PADDING,
  WIDE_SHOT_PADDING,
  expandForContext,
  frameBox,
  objectWorldBox,
  paddingForAspect,
  unionWorldBox,
} from "./camera-framing.js";

/** Tolerance band for "deviated" panel highlighting (mm). */
const DEVIATED_SEVERE_MM = 5.0;
const DIM_OPACITY = 0.25;

/** Tween keys used with the shared AnimRunner. */
const TWEEN_KEY_CAMERA = "camera";
const TWEEN_KEY_PANEL = "panel";
const TWEEN_KEY_ARROWS = "arrows";

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
  const focusedPartId = pickFocusedPart(bundle);

  // Canvas region sits as the first child so the overlay (added later by
  // mountOverlay) paints on top. The wrapper has its own touch-action: none
  // (set in CSS) and its own layout box, which lets the responsive CSS shrink
  // it to 60vh on mobile portrait without affecting overlay positioning.
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "de-canvas-wrap";
  container.appendChild(canvasWrap);

  // Scene is created with a placeholder camera; we recompute position once
  // the panels are mounted (so we can read the true world-space AABB rather
  // than a centroid-based guess).
  const scene = createScene({
    container: canvasWrap,
    transparent: true,
  });

  const panels = new Map<string, PanelHandle>();
  for (const part of fixture.parts) {
    const handle = mountPanel(part, scene);
    panels.set(part.partId, handle);
  }

  const facadeBox = unionWorldBox(
    Array.from(panels.values(), (p) => p.group),
  );
  scene.contentRoot.add(buildGroundPlane(facadeBox));

  // Initial wide shot — derived from the actual facade AABB, the current
  // camera FOV, and the current viewport aspect.
  const initialWide = frameBox(
    facadeBox,
    scene.camera.fov,
    scene.camera.aspect,
    paddingForAspect(WIDE_SHOT_PADDING, scene.camera.aspect),
  );
  scene.camera.position.copy(initialWide.position);
  scene.controls.target.copy(initialWide.target);
  scene.controls.update();

  // ---- Phase 3 visualization layer ------------------------------------------

  const arrows = buildDeviationArrows(fixture, bundle);
  arrows.group.visible = false;
  scene.contentRoot.add(arrows.group);

  // Feature markers + DOF ghosts attach to the focused panel group (part frame).
  const featureMarkers = mountFeatureMarkers(panels, bundle, focusedPartId);
  const dofGhosts = mountDofGhosts(panels, bundle, focusedPartId);

  // ---- Animation runner -----------------------------------------------------

  // Respect prefers-reduced-motion at construction, and listen for changes so
  // a user toggling the OS setting mid-session is honoured.
  const reduceMotionQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const animRunner = new AnimRunner(undefined, {
    reduceMotion: reduceMotionQuery?.matches ?? false,
  });
  const onReduceMotionChange = (e: MediaQueryListEvent) => {
    animRunner.setReduceMotion(e.matches);
  };
  reduceMotionQuery?.addEventListener?.("change", onReduceMotionChange);
  const unsubscribeTick = scene.onBeforeRender(() => animRunner.tick());

  // Cancel any active camera tween if the user grabs the orbit controls.
  // Cancel-on-input matches the Phase 3 plan (free-orbit always wins).
  const onUserOrbitStart = () => {
    if (animRunner.has(TWEEN_KEY_CAMERA)) animRunner.cancel(TWEEN_KEY_CAMERA);
  };
  scene.controls.addEventListener("start", onUserOrbitStart);

  const controller = new BeatController({ focusedPartId });

  const applyBeatToScene = (state: BeatState, previous: BeatState | null): void => {
    applyHighlights(panels, bundle, state);
    applyVisibility(state, arrows, featureMarkers, dofGhosts);
    animatePanelPoses(state, previous, fixture, bundle, panels, animRunner);
    animateArrows(state, previous, arrows, animRunner);
    animateCamera(state, previous, scene, facadeBox, panels, animRunner);
  };

  controller.on((current, previous) => {
    applyBeatToScene(current, previous);
  });
  applyBeatToScene(controller.current, null);

  // Re-snap camera framing when the viewport aspect changes (orientation
  // rotation, browser resize, dev-tools open/close). Phase 4 only updated
  // `camera.aspect`; the camera *position* never recomputed, so on portrait
  // the wide shot stayed framed for landscape. Cheap to recompute on each
  // resize event.
  let lastAspect = scene.camera.aspect;
  const resizeObserver = new ResizeObserver(() => {
    const aspect = scene.camera.aspect;
    if (Math.abs(aspect - lastAspect) < 0.01) return;
    lastAspect = aspect;
    if (animRunner.has(TWEEN_KEY_CAMERA)) return; // user-initiated tween wins
    const target = computeBeatWaypoint(
      controller.current,
      scene,
      facadeBox,
      panels,
    );
    if (!target) return;
    scene.camera.position.copy(target.position);
    scene.controls.target.copy(target.target);
    scene.controls.update();
  });
  resizeObserver.observe(canvasWrap);

  const overlay = mountOverlay({
    host: container,
    controller,
    bundle,
    onApply: () => {
      // Scene apply effect is driven by the beat transition listener;
      // nothing else to do here.
    },
    onRestart: () => {
      // Controller.reset() goes to beat 1; the scene listener picks it up.
    },
  });

  // Reset-view button: snaps the camera back to the current beat's default
  // waypoint. Helpful on touch when free-orbit drifts the camera off the
  // facade. Cancels any in-flight camera tween before snapping.
  const resetBtn = createResetButton(() => {
    if (animRunner.has(TWEEN_KEY_CAMERA)) animRunner.cancel(TWEEN_KEY_CAMERA);
    const target = computeBeatWaypoint(
      controller.current,
      scene,
      facadeBox,
      panels,
    );
    if (!target) return;
    scene.camera.position.copy(target.position);
    scene.controls.target.copy(target.target);
    scene.controls.update();
  });
  container.appendChild(resetBtn);

  return {
    scene,
    fixture,
    controller,
    bundle,
    dispose: () => {
      animRunner.cancelAll();
      unsubscribeTick();
      reduceMotionQuery?.removeEventListener?.("change", onReduceMotionChange);
      scene.controls.removeEventListener("start", onUserOrbitStart);
      resizeObserver.disconnect();
      arrows.dispose();
      featureMarkers?.dispose();
      dofGhosts?.dispose();
      overlay.dispose();
      if (overlay.element.parentElement === container) {
        container.removeChild(overlay.element);
      }
      if (resetBtn.parentElement === container) {
        container.removeChild(resetBtn);
      }
      scene.dispose();
      if (canvasWrap.parentElement === container) {
        container.removeChild(canvasWrap);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

function mountPanel(part: FacadePart, scene: SceneHandle): PanelHandle {
  // Render the panel at its as-built pose for beat 1 (deviation visible);
  // we'll animate to corrected pose at beat 4. If as-built is missing, fall
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

function mountFeatureMarkers(
  panels: Map<string, PanelHandle>,
  bundle: EngineBundle,
  focusedPartId: string | null,
): FeatureMarkersHandle | null {
  if (!focusedPartId) return null;
  const panel = panels.get(focusedPartId);
  const constraint = bundle.constraintById.get(focusedPartId);
  if (!panel || !constraint?.features?.length) return null;
  const handle = buildFeatureMarkers({ features: constraint.features });
  handle.group.visible = false;
  panel.group.add(handle.group);
  return handle;
}

function mountDofGhosts(
  panels: Map<string, PanelHandle>,
  bundle: EngineBundle,
  focusedPartId: string | null,
): DofGhostsHandle | null {
  if (!focusedPartId) return null;
  const panel = panels.get(focusedPartId);
  const constraint = bundle.constraintById.get(focusedPartId);
  if (!panel || !constraint?.features?.length) return null;
  const handle = buildDofGhosts({
    features: constraint.features,
    constraint,
  });
  handle.group.visible = false;
  panel.group.add(handle.group);
  return handle;
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

function applyVisibility(
  state: BeatState,
  arrows: DeviationArrowsHandle,
  features: FeatureMarkersHandle | null,
  ghosts: DofGhostsHandle | null,
): void {
  // Arrows visible from beat 2 onward; beat-4 shrink is driven by animateArrows.
  arrows.group.visible = state.beat >= 2 && state.beat <= 4;

  // DOF ghosts: beat 2 only — they explain the part's allowed motion.
  if (ghosts) ghosts.group.visible = state.beat === 2;

  // Feature markers: beats 2 and 3. Fade out before Apply so the directive
  // card has the visual spotlight.
  if (features) features.group.visible = state.beat === 2 || state.beat === 3;
}

// ---------------------------------------------------------------------------
// Animated transitions
// ---------------------------------------------------------------------------

function animatePanelPoses(
  state: BeatState,
  previous: BeatState | null,
  fixture: FacadeFixture,
  bundle: EngineBundle,
  panels: Map<string, PanelHandle>,
  runner: AnimRunner,
): void {
  const wasApplied = previous ? previous.beat >= 4 : false;
  const isApplied = state.beat >= 4;

  // Most beat transitions don't change panel poses — short-circuit when the
  // applied state hasn't flipped to avoid redundant snaps.
  if (wasApplied === isApplied && previous !== null) return;

  for (const part of fixture.parts) {
    const handle = panels.get(part.partId);
    if (!handle) continue;
    const targetPose = isApplied
      ? correctedPoseFor(part, bundle)
      : part.asBuilt ?? part.nominal;

    // Only animate the focused panel on the apply transition; others snap.
    const shouldAnimate =
      previous !== null &&
      part.partId === state.focusedPartId &&
      previous.beat < 4 &&
      isApplied;

    if (!shouldAnimate) {
      applyPose(handle.group, targetPose);
      continue;
    }

    const fromState = {
      position: handle.group.position.clone(),
      quaternion: handle.group.quaternion.clone(),
    };
    const toState = poseToState(targetPose);

    runner.start({
      key: `${TWEEN_KEY_PANEL}:${part.partId}`,
      durationMs: DEFAULT_PANEL_DURATION_MS,
      onUpdate: (t) => {
        const s = samplePanelTween(fromState, toState, t);
        handle.group.position.copy(s.position);
        handle.group.quaternion.copy(s.quaternion);
      },
    });
  }
}

function animateArrows(
  state: BeatState,
  previous: BeatState | null,
  arrows: DeviationArrowsHandle,
  runner: AnimRunner,
): void {
  const wasApplied = previous ? previous.beat >= 4 : false;
  const isApplied = state.beat >= 4;

  // On beat-3→4: shrink the focused panel's arrow to 0 in parallel with the
  // panel tween. Other arrows snap to their target scale.
  for (const [partId, arrow] of arrows.byPartId) {
    const targetScale = state.beat >= 4 ? 0 : 1;
    const fromScale = arrow.scale.x;

    const shouldAnimate =
      previous !== null &&
      !wasApplied &&
      isApplied &&
      partId === state.focusedPartId &&
      fromScale > 0;

    if (!shouldAnimate) {
      setArrowScale(arrow, targetScale);
      continue;
    }

    runner.start({
      key: `${TWEEN_KEY_ARROWS}:${partId}`,
      durationMs: DEFAULT_ARROW_DURATION_MS,
      onUpdate: (t) => {
        const s = sampleArrowTween(fromScale, targetScale, t);
        setArrowScale(arrow, s);
      },
    });
  }
}

function animateCamera(
  state: BeatState,
  previous: BeatState | null,
  scene: SceneHandle,
  facadeBox: THREE.Box3,
  panels: Map<string, PanelHandle>,
  runner: AnimRunner,
): void {
  const target = computeBeatWaypoint(state, scene, facadeBox, panels);
  if (!target) return;

  // On first apply (no previous state) we snap so the initial frame is correct.
  if (previous === null) {
    scene.camera.position.copy(target.position);
    scene.controls.target.copy(target.target);
    scene.controls.update();
    return;
  }

  const from = snapshotCamera(scene.camera, scene.controls.target);
  // No work if we're already where we should be.
  if (
    from.position.distanceToSquared(target.position) < 1 &&
    from.target.distanceToSquared(target.target) < 1
  ) {
    return;
  }

  runner.start({
    key: TWEEN_KEY_CAMERA,
    durationMs: DEFAULT_CAMERA_DURATION_MS,
    onUpdate: (t) => {
      const s = sampleCameraTween(from, target, t);
      scene.camera.position.copy(s.position);
      scene.controls.target.copy(s.target);
      scene.controls.update();
    },
  });
}

/**
 * Per-beat camera waypoint, derived from the current viewport's FOV /
 * aspect and the rendered geometry's world-space AABB.
 *
 *   Beat 1, 5 — wide shot framing the full facade (beat 5 pulls back a
 *               touch via slightly larger padding).
 *   Beat 2-4 — close on the focused panel, with the focus AABB expanded
 *               by ~2.4× so 1-2 neighbouring panels stay in frame for
 *               spatial context. Beats 3 + 4 add a small extra padding
 *               nudge so the directive card / bottom sheet doesn't crowd
 *               the focused panel.
 */
function computeBeatWaypoint(
  state: BeatState,
  scene: SceneHandle,
  facadeBox: THREE.Box3,
  panels: Map<string, PanelHandle>,
): CameraWaypoint | null {
  const fov = scene.camera.fov;
  const aspect = scene.camera.aspect;

  if (state.beat === 1) {
    return frameBox(facadeBox, fov, aspect, paddingForAspect(WIDE_SHOT_PADDING, aspect));
  }
  if (state.beat === 5) {
    return frameBox(facadeBox, fov, aspect, paddingForAspect(WIDE_SHOT_PADDING * 1.1, aspect));
  }

  const focused = state.focusedPartId ? panels.get(state.focusedPartId) : null;
  if (!focused) return null;

  // Beat 2: dolly in tight (still showing neighbours).
  // Beat 3: small pull-back so the directive card has clearance.
  // Beat 4: hold position to read the panel tween cleanly.
  const contextScale = state.beat === 2 ? 2.4 : 2.6;
  const basePadding =
    state.beat === 2 ? CLOSE_SHOT_PADDING : CLOSE_SHOT_PADDING * 1.1;
  const focusBox = expandForContext(objectWorldBox(focused.group), contextScale);
  return frameBox(focusBox, fov, aspect, paddingForAspect(basePadding, aspect));
}

function correctedPoseFor(part: FacadePart, bundle: EngineBundle): { t: [number, number, number]; q: [number, number, number, number] } {
  const step = bundle.stepByPartId.get(part.partId);
  // "Applied" means the panel reaches its nominal pose for non-clamped
  // corrections. If clamped or blocked, fall back to as-built plus the
  // engine's emitted translation delta (no full closure).
  if (!step || step.status === "ok") {
    return part.nominal;
  }
  if (step.status === "blocked") {
    return part.asBuilt ?? part.nominal;
  }
  if (step.status === "clamped") {
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

// ---------------------------------------------------------------------------
// Ground plane (sized off the rendered AABB)
// ---------------------------------------------------------------------------

function createResetButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "de-reset-view";
  btn.setAttribute("aria-label", "Reset camera view");
  btn.title = "Reset view";
  btn.textContent = "Reset view";
  btn.addEventListener("click", onClick);
  return btn;
}

function buildGroundPlane(facadeBox: THREE.Box3): THREE.Object3D {
  const size = new THREE.Vector3();
  facadeBox.getSize(size);
  const center = new THREE.Vector3();
  facadeBox.getCenter(center);
  const groundSize = Math.max(size.x, size.y) * 6 + 10_000;
  const geom = new THREE.PlaneGeometry(groundSize, groundSize);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe6e8eb,
    metalness: 0.0,
    roughness: 0.95,
  });
  const plane = new THREE.Mesh(geom, mat);
  plane.rotation.x = -Math.PI / 2;
  // Sit a hair below the facade's lowest panel.
  plane.position.y = facadeBox.min.y - 50;
  plane.receiveShadow = true;
  plane.name = "ground";
  return plane;
}

export type { OverlayHandle };
