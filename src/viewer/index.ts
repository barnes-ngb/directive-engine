/**
 * Phase 1 viewer entry point.
 *
 * Loads the `toy_facade_v1` fixture, builds proxy panel meshes at their
 * nominal poses, and mounts a polished static Three.js scene into a host
 * element. No interaction or narrative logic — Phase 2 adds the beat
 * controller; Phase 3 adds visualization (deviation arrows, DOF ghosts).
 */

import * as THREE from "three";
import { createScene, type SceneHandle } from "./scene.js";
import { buildPanelMesh, DEFAULT_PANEL_DIMENSIONS } from "./panel-mesh.js";
import { loadToyFacadeFixture, type FacadeFixture } from "./load-fixture.js";

export interface MountedViewer {
  scene: SceneHandle;
  fixture: FacadeFixture;
  /** Tear down GPU resources and remove the canvas. */
  dispose: () => void;
}

export function mountViewer(container: HTMLElement): MountedViewer {
  const fixture = loadToyFacadeFixture();
  const bounds = computePanelBounds(fixture);
  const scene = createScene({
    container,
    lookAt: bounds.center,
    cameraPosition: deriveCameraPosition(bounds),
    transparent: true,
  });

  for (const part of fixture.parts) {
    const panel = buildPanelMesh({
      partId: part.partId,
      pose: part.nominal,
      dimensions: DEFAULT_PANEL_DIMENSIONS,
    });
    scene.contentRoot.add(panel);
  }

  scene.contentRoot.add(buildGroundPlane(bounds));

  return {
    scene,
    fixture,
    dispose: () => scene.dispose(),
  };
}

interface PanelBounds {
  center: THREE.Vector3;
  /** Approximate width across panels along world X (mm). */
  spanX: number;
  /** Approximate height of panels along world Y (mm). */
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
  // 3/4 view from front-right-up, distance scaled by the larger span so the
  // facade always fits the frame regardless of fixture size.
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
