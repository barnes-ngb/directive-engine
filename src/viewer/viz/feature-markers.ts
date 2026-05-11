/**
 * Feature markers: small visual primitives that locate a panel's named
 * kinematic features (`Feature[]` in part frame) so the installer can match
 * the directive language ("Pivot 0.4° about J1") to a place on the part.
 *
 * Primitives:
 *   - Joint  → sphere with a short axis line, colour-coded teal
 *   - Slot   → capsule oriented along the slot axis, colour-coded amber
 *   - Index  → ring of small discs at each indexed position, colour-coded
 *               violet
 *
 * Each marker is built in part-frame coordinates and attached under a single
 * group; callers parent that group to the panel mesh so it inherits the
 * panel's world transform. Sprite labels (J1, S2, P3 …) are added beside each
 * marker.
 */

import * as THREE from "three";
import type { Feature, JointFeature, SlotFeature, IndexFeature, Vec3 } from "../../core/types.js";
import { buildSpriteLabel, type SpriteLabelHandle } from "./sprite-label.js";

const COLOR_JOINT = 0x14b8a6;
const COLOR_SLOT = 0xf59e0b;
const COLOR_INDEX = 0x8b5cf6;

const JOINT_RADIUS_MM = 30;
const JOINT_AXIS_LENGTH_MM = 200;
const SLOT_RADIUS_MM = 20;
const DEFAULT_SLOT_LENGTH_MM = 600;
const INDEX_DOT_RADIUS_MM = 18;
const DEFAULT_INDEX_RING_RADIUS_MM = 300;

const LABEL_OFFSET_MM = 180;

export interface FeatureMarkersHandle {
  group: THREE.Group;
  dispose(): void;
}

export interface FeatureMarkersOptions {
  features: Feature[];
  /**
   * Optional override for slot visual length (mm). Falls back to
   * `DEFAULT_SLOT_LENGTH_MM` if absent.
   */
  slotLengthMm?: number;
  /**
   * Optional override for the index ring radius (mm). Falls back to
   * `DEFAULT_INDEX_RING_RADIUS_MM`.
   */
  indexRingRadiusMm?: number;
}

export function buildFeatureMarkers(opts: FeatureMarkersOptions): FeatureMarkersHandle {
  const group = new THREE.Group();
  group.name = "feature-markers";

  const disposables: Array<{ dispose(): void }> = [];

  for (const feature of opts.features) {
    if (feature.kind === "joint") {
      const handle = buildJointMarker(feature);
      group.add(handle.group);
      disposables.push(handle);
    } else if (feature.kind === "slot") {
      const handle = buildSlotMarker(feature, opts.slotLengthMm ?? DEFAULT_SLOT_LENGTH_MM);
      group.add(handle.group);
      disposables.push(handle);
    } else if (feature.kind === "index") {
      const handle = buildIndexMarker(
        feature,
        opts.indexRingRadiusMm ?? DEFAULT_INDEX_RING_RADIUS_MM,
      );
      group.add(handle.group);
      disposables.push(handle);
    }
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Joint marker
// ---------------------------------------------------------------------------

function buildJointMarker(feature: JointFeature): {
  group: THREE.Group;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.name = `feature:${feature.id}`;
  group.position.set(...feature.position_mm);

  const sphereGeom = new THREE.SphereGeometry(JOINT_RADIUS_MM, 24, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: COLOR_JOINT,
    emissive: 0x0e6b66,
    emissiveIntensity: 0.4,
    metalness: 0.1,
    roughness: 0.5,
  });
  const sphere = new THREE.Mesh(sphereGeom, sphereMat);
  group.add(sphere);

  // Axis line through the joint to show rotation direction.
  const axis = normalizeAxis(feature.axis);
  const halfLen = JOINT_AXIS_LENGTH_MM / 2;
  const linePoints = [
    new THREE.Vector3(-axis.x * halfLen, -axis.y * halfLen, -axis.z * halfLen),
    new THREE.Vector3(axis.x * halfLen, axis.y * halfLen, axis.z * halfLen),
  ];
  const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMat = new THREE.LineBasicMaterial({ color: COLOR_JOINT, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(lineGeom, lineMat);
  group.add(line);

  const label = buildSpriteLabel({
    text: feature.id,
    backgroundColor: "rgba(20,46,44,0.85)",
  });
  label.sprite.position.set(0, LABEL_OFFSET_MM, 0);
  group.add(label.sprite);

  return {
    group,
    dispose() {
      sphereGeom.dispose();
      sphereMat.dispose();
      lineGeom.dispose();
      lineMat.dispose();
      label.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Slot marker
// ---------------------------------------------------------------------------

function buildSlotMarker(
  feature: SlotFeature,
  slotLengthMm: number,
): {
  group: THREE.Group;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.name = `feature:${feature.id}`;
  group.position.set(...feature.position_mm);

  const axis = normalizeAxis(feature.axis);
  // CapsuleGeometry is built along +Y; rotate to align with the slot axis.
  const capsuleGeom = new THREE.CapsuleGeometry(SLOT_RADIUS_MM, slotLengthMm, 8, 16);
  const capsuleMat = new THREE.MeshStandardMaterial({
    color: COLOR_SLOT,
    emissive: 0x6b3a05,
    emissiveIntensity: 0.35,
    metalness: 0.05,
    roughness: 0.7,
  });
  const capsule = new THREE.Mesh(capsuleGeom, capsuleMat);
  alignYAxisTo(capsule, axis);
  group.add(capsule);

  const label = buildSpriteLabel({
    text: feature.id,
    backgroundColor: "rgba(56,38,8,0.85)",
  });
  // Offset label perpendicular-ish to axis so it doesn't overlap the capsule.
  label.sprite.position.set(0, LABEL_OFFSET_MM, 0);
  group.add(label.sprite);

  return {
    group,
    dispose() {
      capsuleGeom.dispose();
      capsuleMat.dispose();
      label.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Index marker
// ---------------------------------------------------------------------------

function buildIndexMarker(
  feature: IndexFeature,
  ringRadiusMm: number,
): {
  group: THREE.Group;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.name = `feature:${feature.id}`;
  group.position.set(...feature.position_mm);

  const axis = normalizeAxis(feature.axis);

  // Orient an internal sub-group so +Y points along the axis, then place dots
  // in the local XZ plane.
  const oriented = new THREE.Group();
  alignYAxisTo(oriented, axis);
  group.add(oriented);

  const dotGeom = new THREE.SphereGeometry(INDEX_DOT_RADIUS_MM, 16, 12);
  const dotMat = new THREE.MeshStandardMaterial({
    color: COLOR_INDEX,
    emissive: 0x371f6b,
    emissiveIntensity: 0.4,
    metalness: 0.1,
    roughness: 0.5,
  });

  const count = Math.max(1, Math.floor(feature.count));
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.position.set(Math.cos(theta) * ringRadiusMm, 0, Math.sin(theta) * ringRadiusMm);
    oriented.add(dot);
    dots.push(dot);
  }

  const label = buildSpriteLabel({
    text: feature.id,
    backgroundColor: "rgba(38,24,76,0.85)",
  });
  label.sprite.position.set(0, ringRadiusMm + LABEL_OFFSET_MM, 0);
  group.add(label.sprite);

  return {
    group,
    dispose() {
      dotGeom.dispose();
      dotMat.dispose();
      label.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function normalizeAxis(v: Vec3): THREE.Vector3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]);
  const len = out.length();
  if (len < 1e-9) return new THREE.Vector3(0, 1, 0);
  return out.divideScalar(len);
}

/** Rotate `obj` so its local +Y direction maps to `axis` (unit vector). */
function alignYAxisTo(obj: THREE.Object3D, axis: THREE.Vector3): void {
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, axis);
  obj.quaternion.copy(q);
}
