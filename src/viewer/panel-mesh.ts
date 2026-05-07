/**
 * Builds proxy panel geometry for the 3D viewer.
 *
 * A panel is a beveled box rendered with a `MeshStandardMaterial` to read as
 * a generic metal-ish facade element. The returned `THREE.Group` is named
 * with the part ID so later phases (Phase 3 visualization, Phase 2 beat
 * controller) can look up panels by ID.
 */

import * as THREE from "three";
import type { PartPose } from "./load-fixture.js";

export interface PanelDimensions {
  /** Panel width in mm (along part-frame X). */
  widthMm: number;
  /** Panel height in mm (along part-frame Y). */
  heightMm: number;
  /** Panel thickness in mm (along part-frame Z). */
  thicknessMm: number;
}

/** Default panel dimensions — placeholder until fixture declares per-part sizes. */
export const DEFAULT_PANEL_DIMENSIONS: PanelDimensions = {
  widthMm: 1500,
  heightMm: 1000,
  thicknessMm: 50,
};

export interface PanelStyle {
  color: THREE.ColorRepresentation;
  metalness: number;
  roughness: number;
}

export const DEFAULT_PANEL_STYLE: PanelStyle = {
  color: 0x9aa0a6,
  metalness: 0.3,
  roughness: 0.6,
};

export interface BuildPanelOptions {
  partId: string;
  pose: PartPose;
  dimensions?: PanelDimensions;
  style?: PanelStyle;
}

/**
 * Build a Three.js Group containing a single proxy panel.
 *
 * The Group's transform is set from `pose` (translation in mm, quaternion
 * `[x,y,z,w]`). The mesh is placed at the Group origin so that callers can
 * later swap the Group transform (e.g., to animate nominal → corrected pose
 * in Phase 3) without touching the mesh.
 */
export function buildPanelMesh(options: BuildPanelOptions): THREE.Group {
  const dims = options.dimensions ?? DEFAULT_PANEL_DIMENSIONS;
  const style = options.style ?? DEFAULT_PANEL_STYLE;

  const group = new THREE.Group();
  group.name = options.partId;
  group.userData.partId = options.partId;

  const geom = createBeveledBoxGeometry(dims);
  const mat = new THREE.MeshStandardMaterial({
    color: style.color,
    metalness: style.metalness,
    roughness: style.roughness,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${options.partId}:mesh`;
  group.add(mesh);

  applyPose(group, options.pose);
  return group;
}

/** Sets a Group's local transform from a `PartPose` (translation in mm). */
export function applyPose(target: THREE.Object3D, pose: PartPose): void {
  target.position.set(pose.t[0], pose.t[1], pose.t[2]);
  target.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
}

/**
 * Beveled box: a slightly-inset front face gives panels a tactile feel
 * without the cost of bevel modifiers. We achieve this with `BoxGeometry`
 * for now; if richer geometry is needed in later phases, swap to a custom
 * extruded shape.
 */
function createBeveledBoxGeometry(dims: PanelDimensions): THREE.BufferGeometry {
  const { widthMm, heightMm, thicknessMm } = dims;
  return new THREE.BoxGeometry(widthMm, heightMm, thicknessMm, 1, 1, 1);
}
