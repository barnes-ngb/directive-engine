/**
 * Three.js scene scaffolding for the directive-engine viewer.
 *
 * Owns the renderer, scene, camera, lights, and OrbitControls. Exposes
 * `mount()` to attach to a DOM element and `dispose()` for hot-reload
 * cleanup. Phase 1 deliverable — no narrative or interaction logic lives
 * here.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Container into which panels and other content should be added. */
  contentRoot: THREE.Group;
  /**
   * Register a per-frame callback invoked just before each render. Returns
   * an unsubscribe function. Used by the animation runner so tweens share
   * the scene's single render loop.
   */
  onBeforeRender: (fn: () => void) => () => void;
  /** Tear down GPU resources, listeners, and the animation loop. */
  dispose: () => void;
}

export interface SceneOptions {
  container: HTMLElement;
  /** World-space target the camera looks at (mm). Defaults to origin. */
  lookAt?: THREE.Vector3;
  /** Initial camera position (mm). Caller should size this to the scene. */
  cameraPosition?: THREE.Vector3;
  /**
   * If true, set transparent clear colour so the page background shows
   * through. If false, use a subtle radial-feeling neutral. Default: true.
   */
  transparent?: boolean;
}

/** Initialize and mount a Three.js scene into `container`. */
export function createScene(options: SceneOptions): SceneHandle {
  const { container } = options;
  const transparent = options.transparent ?? true;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: transparent,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const initialSize = readContainerSize(container);
  renderer.setSize(initialSize.width, initialSize.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
  } else {
    renderer.setClearColor(0xeef0f3, 1);
  }
  // The canvas is decorative — the overlay region carries the semantic copy.
  // Marking it hidden keeps assistive tech focused on the textual narrative.
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.setAttribute("role", "presentation");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    35,
    initialSize.width / initialSize.height,
    10, // 10 mm near plane — fine for mm-scale facade work
    100_000, // 100 m far plane
  );
  if (options.cameraPosition) {
    camera.position.copy(options.cameraPosition);
  } else {
    camera.position.set(3000, 1500, 3000);
  }
  const lookAt = options.lookAt ?? new THREE.Vector3(0, 0, 0);
  camera.lookAt(lookAt);

  // Lights: hemisphere fill + directional key + soft fill.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404048, 0.65);
  hemi.position.set(0, 5000, 0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2500, 4000, 2000);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 100;
  key.shadow.camera.far = 15000;
  key.shadow.camera.left = -5000;
  key.shadow.camera.right = 5000;
  key.shadow.camera.top = 5000;
  key.shadow.camera.bottom = -5000;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc6d4ff, 0.25);
  fill.position.set(-2000, 1500, -1500);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = false;
  // Touch mapping: one-finger drag rotates, two-finger pinch zooms.
  // DOLLY_PAN includes pan but enablePan=false makes the pan portion a no-op.
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  // Keep the user above ground.
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.copy(lookAt);
  controls.update();

  // CSS-level safeguard: even with touch-action: none on the host, some
  // mobile browsers re-enable touch panning on canvas elements unless the
  // attribute is set directly. Apply it here so OrbitControls reliably
  // receives single-finger drag events on iOS and Android.
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  (renderer.domElement.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";

  const contentRoot = new THREE.Group();
  contentRoot.name = "contentRoot";
  scene.add(contentRoot);

  // Per-frame callbacks (animation runner subscribes here).
  const beforeRenderCallbacks = new Set<() => void>();
  const onBeforeRender = (fn: () => void): (() => void) => {
    beforeRenderCallbacks.add(fn);
    return () => {
      beforeRenderCallbacks.delete(fn);
    };
  };

  // Animation loop.
  let running = true;
  const tick = () => {
    if (!running) return;
    for (const cb of beforeRenderCallbacks) cb();
    controls.update();
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(tick);
  };
  let animationFrameId = requestAnimationFrame(tick);

  // Resize handling.
  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = readContainerSize(container);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  const dispose = () => {
    running = false;
    cancelAnimationFrame(animationFrameId);
    resizeObserver.disconnect();
    controls.dispose();
    disposeSceneTree(scene);
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    contentRoot,
    onBeforeRender,
    dispose,
  };
}

function readContainerSize(container: HTMLElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  // Fall back to viewport size if the container has no layout yet (display:none, etc.).
  const width = rect.width > 0 ? rect.width : window.innerWidth;
  const height = rect.height > 0 ? rect.height : window.innerHeight;
  return { width, height };
}

function disposeSceneTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    }
  });
}
