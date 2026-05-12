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

  // Canvas wrapper: lets responsive CSS shrink the canvas to the top region
  // on mobile portrait (canvas 60dvh, overlay bottom-sheet 40dvh) while
  // staying full-bleed on tablet/desktop. The overlay continues to cover
  // the whole #viewer so the headline still sits over the canvas.
  const canvasRegion = document.createElement("div");
  canvasRegion.className = "de-canvas-region";
  container.appendChild(canvasRegion);

  const fixture = loadToyFacadeFixture();
  const bundle = buildEngineBundle(fixture);
  const bounds = computePanelBounds(fixture);
  const focusedPartId = pickFocusedPart(bundle);

  const initialAspect = readCanvasAspect(canvasRegion);
  const scene = createScene({
    container: canvasRegion,
    lookAt: bounds.center,
    cameraPosition: deriveCameraPosition(bounds, initialAspect),
    transparent: true,
  });

  const panels = new Map<string, PanelHandle>();
  for (const part of fixture.parts) {
    const handle = mountPanel(part, scene);
    panels.set(part.partId, handle);
  }

  scene.contentRoot.add(buildGroundPlane(bounds));

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

  // Wide-shot is derived from bounds + current viewport aspect, so portrait
  // and landscape get correct framing without orientation-change drift.
  const getWideShot = (): CameraWaypoint => ({
    position: deriveCameraPosition(bounds, scene.camera.aspect),
    target: bounds.center.clone(),
  });

  const applyBeatToScene = (state: BeatState, previous: BeatState | null): void => {
    applyHighlights(panels, bundle, state);
    applyVisibility(state, arrows, featureMarkers, dofGhosts);
    animatePanelPoses(state, previous, fixture, bundle, panels, animRunner);
    animateArrows(state, previous, arrows, animRunner);
    animateCamera(state, previous, scene, bounds, panels, getWideShot(), animRunner);
  };

  controller.on((current, previous) => {
    applyBeatToScene(current, previous);
  });
  applyBeatToScene(controller.current, null);

  // Reframe wide-shot beats when the viewport aspect changes (orientation
  // flip, browser resize, mobile chrome show/hide). For close-up beats we
  // leave the framing alone — the user is locked in on a single panel and
  // a sudden zoom would be jarring.
  const onViewportResize = (): void => {
    const state = controller.current;
    if (state.beat !== 1 && state.beat !== 5) return;
    // Snap (don't tween) so resize feels instant.
    const waypoint = pickCameraWaypoint(state, scene, bounds, panels, getWideShot());
    if (!waypoint) return;
    animRunner.cancel(TWEEN_KEY_CAMERA);
    scene.camera.position.copy(waypoint.position);
    scene.controls.target.copy(waypoint.target);
    scene.controls.update();
  };
  const resizeObserver = new ResizeObserver(() => onViewportResize());
  resizeObserver.observe(canvasRegion);
  const onWindowResize = () => onViewportResize();
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("orientationchange", onWindowResize);

  // Reset-view: snap camera back to the current beat's default waypoint.
  // Useful after free-orbit drags the user out of the framing.
  const resetView = (): void => {
    const waypoint = pickCameraWaypoint(
      controller.current,
      scene,
      bounds,
      panels,
      getWideShot(),
    );
    if (!waypoint) return;
    animRunner.cancel(TWEEN_KEY_CAMERA);
    const from = snapshotCamera(scene.camera, scene.controls.target);
    animRunner.start({
      key: TWEEN_KEY_CAMERA,
      durationMs: DEFAULT_CAMERA_DURATION_MS,
      onUpdate: (t) => {
        const s = sampleCameraTween(from, waypoint, t);
        scene.camera.position.copy(s.position);
        scene.controls.target.copy(s.target);
        scene.controls.update();
      },
    });
  };

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
    onResetView: resetView,
  });

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
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      arrows.dispose();
      featureMarkers?.dispose();
      dofGhosts?.dispose();
      overlay.dispose();
      if (overlay.element.parentElement === container) {
        container.removeChild(overlay.element);
      }
      scene.dispose();
      if (canvasRegion.parentElement === container) {
        container.removeChild(canvasRegion);
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
  bounds: PanelBounds,
  panels: Map<string, PanelHandle>,
  wideShot: CameraWaypoint,
  runner: AnimRunner,
): void {
  const target = pickCameraWaypoint(state, scene, bounds, panels, wideShot);
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

function pickCameraWaypoint(
  state: BeatState,
  scene: SceneHandle,
  bounds: PanelBounds,
  panels: Map<string, PanelHandle>,
  wideShot: CameraWaypoint,
): CameraWaypoint | null {
  // Beats 1 and 5: wide shot. Beats 2-4: close on focused panel, with slight
  // framing nudges between beats to keep the camera alive without being busy.
  if (state.beat === 1 || state.beat === 5) {
    // Beat 5 pulls back a little further than the intro to show the
    // verification metric panel context.
    if (state.beat === 5) {
      return scaleWideShot(wideShot, bounds, 1.15);
    }
    return { position: wideShot.position.clone(), target: wideShot.target.clone() };
  }

  if (!state.focusedPartId) return null;
  const focused = panels.get(state.focusedPartId);
  if (!focused) return null;

  const center = focused.group.position.clone();
  // FOV-correct close-up: frame a single panel (+ a touch of context) and
  // apply per-beat zoom factors. Portrait gets extra padding so the
  // bottom-sheet overlay doesn't clip the focused panel.
  const aspect = scene.camera.aspect;
  const portrait = isPortraitAspect(aspect);
  const focusBounds: PanelBounds = {
    center,
    spanX: DEFAULT_PANEL_DIMENSIONS.widthMm * 1.6,
    spanY: DEFAULT_PANEL_DIMENSIONS.heightMm * 1.6,
  };
  // Beat 2: dolly in close. Beat 3: tiny pull-back for the directive card.
  // Beat 4: between the two.
  const zoom = state.beat === 2 ? 1.05 : state.beat === 3 ? 1.35 : 1.2;
  const padding = (portrait ? 1.3 : 1.0) * zoom;
  const distance = frameDistance(focusBounds, 35, aspect) * padding;
  const dir = new THREE.Vector3(0.55, 0.35, 0.85).normalize();

  return {
    position: center.clone().addScaledVector(dir, distance),
    target: center,
  };
  // (bounds and scene are part of the API for future use — silence unused warnings.)
  void scene;
  void bounds;
}

function scaleWideShot(
  wideShot: CameraWaypoint,
  bounds: PanelBounds,
  factor: number,
): CameraWaypoint {
  // Pull the camera away from the look-at by `factor` for the verify shot.
  const offset = new THREE.Vector3().subVectors(wideShot.position, bounds.center);
  offset.multiplyScalar(factor);
  return {
    position: bounds.center.clone().add(offset),
    target: wideShot.target.clone(),
  };
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
// Bounds + camera framing (carried forward from Phase 1)
// ---------------------------------------------------------------------------

interface PanelBounds {
  center: THREE.Vector3;
  /** Full extent including one panel's worth of size on each axis. */
  spanX: number;
  spanY: number;
}

function computePanelBounds(fixture: FacadeFixture): PanelBounds {
  if (fixture.parts.length === 0) {
    return {
      center: new THREE.Vector3(),
      spanX: DEFAULT_PANEL_DIMENSIONS.widthMm,
      spanY: DEFAULT_PANEL_DIMENSIONS.heightMm,
    };
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of fixture.parts) {
    const [x, y, z] = p.nominal.t;
    min.min(new THREE.Vector3(x, y, z));
    max.max(new THREE.Vector3(x, y, z));
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  // Walking centre positions only captures centre-to-centre distance.
  // The framing must cover the panel extents too: add a full panel
  // dimension so the outermost panels are fully inside the frame.
  const spanX = max.x - min.x + DEFAULT_PANEL_DIMENSIONS.widthMm;
  const spanY = max.y - min.y + DEFAULT_PANEL_DIMENSIONS.heightMm;
  return { center, spanX, spanY };
}

/**
 * Camera distance that frames `bounds` given the camera's vertical FOV and
 * the current viewport aspect. Uses whichever of the vertical or
 * horizontal FOV is the binding constraint, so portrait viewports
 * automatically pull back far enough to fit a wide facade.
 */
function frameDistance(
  bounds: PanelBounds,
  verticalFovDeg: number,
  aspect: number,
): number {
  const vFov = (verticalFovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = bounds.spanY / 2 / Math.tan(vFov / 2);
  const distH = bounds.spanX / 2 / Math.tan(hFov / 2);
  return Math.max(distV, distH);
}

function readCanvasAspect(canvas: HTMLElement): number {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width > 0 ? rect.width : window.innerWidth;
  const h = rect.height > 0 ? rect.height : window.innerHeight;
  return w / Math.max(h, 1);
}

function isPortraitAspect(aspect: number): boolean {
  return aspect < 1;
}

function deriveCameraPosition(bounds: PanelBounds, aspect: number): THREE.Vector3 {
  // FOV-correct distance with a small padding factor. Portrait aspects get
  // a touch more padding because they need negative space below the facade
  // for the bottom-sheet overlay region.
  const padding = isPortraitAspect(aspect) ? 1.25 : 1.15;
  const distance = frameDistance(bounds, 35, aspect) * padding;
  // Offset direction: 3/4 view (right, slightly above, in front of facade).
  const dir = new THREE.Vector3(0.7, 0.4, 0.7).normalize();
  return bounds.center.clone().addScaledVector(dir, distance);
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
