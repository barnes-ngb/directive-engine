/**
 * DOF ghost geometry: translucent geometry that communicates a part's
 * allowed-motion bounds at beat 2. Builds one ghost per declared feature on
 * the focused panel.
 *
 * Conventions:
 *   - Joint  → translucent arc swept around the joint axis showing the
 *               allowed rotation range. If the constraint declares no
 *               `rotation_max_abs_deg` for that axis, we draw a small
 *               indicator (±15°) so the joint still reads as rotatable.
 *   - Slot   → translucent capsule extruded along the slot axis with length
 *               = 2 × `translation_max_abs_mm` for the corresponding world
 *               axis (or a sensible default).
 *   - Index  → discrete ghost panels at each indexed rotation position,
 *               attenuated by distance from the nominal index.
 *
 * Hatched/striped material: implemented as a `ShaderMaterial` writing a
 * procedural stripe in fragment space. Cheaper than a decal texture and looks
 * crisp at any scale. Stripes are placed on the *outside* of the allowed
 * region for joints — visually saying "you can't go there."
 *
 * All ghosts are built in part-frame coordinates and grouped under a single
 * `THREE.Group`. The caller parents that group to the focused panel mesh so
 * it inherits the panel's pose.
 */

import * as THREE from "three";
import type {
  Feature,
  IndexFeature,
  JointFeature,
  PartConstraint,
  SlotFeature,
  Vec3,
} from "../../core/types.js";

const COLOR_ALLOWED = new THREE.Color(0x60a5fa); // soft blue
const COLOR_FORBIDDEN = new THREE.Color(0xef4444); // red — same as severe arrow
const ALLOWED_OPACITY = 0.28;
const HATCH_OPACITY = 0.30;

const DEFAULT_ROTATION_RANGE_DEG = 15;
const DEFAULT_SLOT_HALF_TRAVEL_MM = 300;
const SLOT_GHOST_RADIUS_MM = 60;
const JOINT_ARC_RADIUS_MM = 350;
const INDEX_GHOST_RADIUS_MM = 380;
const INDEX_GHOST_DOT_RADIUS_MM = 36;

export interface DofGhostsHandle {
  group: THREE.Group;
  dispose(): void;
}

export interface DofGhostsOptions {
  features: Feature[];
  constraint?: PartConstraint;
}

export function buildDofGhosts(opts: DofGhostsOptions): DofGhostsHandle {
  const group = new THREE.Group();
  group.name = "dof-ghosts";

  const disposables: Array<{ dispose(): void }> = [];

  for (const feature of opts.features) {
    let handle: { group: THREE.Group; dispose(): void } | null = null;
    if (feature.kind === "joint") {
      handle = buildJointGhost(feature, opts.constraint);
    } else if (feature.kind === "slot") {
      handle = buildSlotGhost(feature, opts.constraint);
    } else if (feature.kind === "index") {
      handle = buildIndexGhost(feature, opts.constraint);
    }
    if (handle) {
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
// Joint ghost — allowed arc + hatched forbidden zone
// ---------------------------------------------------------------------------

function buildJointGhost(
  feature: JointFeature,
  constraint?: PartConstraint,
): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = `ghost:${feature.id}`;
  group.position.set(...feature.position_mm);

  const axis = normalizeAxis(feature.axis);
  const orient = new THREE.Group();
  alignYAxisTo(orient, axis);
  group.add(orient);

  const rangeDeg = pickRotationRangeDeg(feature, constraint);
  const rangeRad = THREE.MathUtils.degToRad(rangeDeg);

  // Allowed arc: ring sector from -range to +range in the local XZ plane.
  const allowedGeom = makeRingSectorGeometry(
    JOINT_ARC_RADIUS_MM * 0.78,
    JOINT_ARC_RADIUS_MM,
    -rangeRad,
    rangeRad,
    32,
  );
  const allowedMat = new THREE.MeshBasicMaterial({
    color: COLOR_ALLOWED,
    transparent: true,
    opacity: ALLOWED_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const allowed = new THREE.Mesh(allowedGeom, allowedMat);
  // Lie flat in the local XZ plane.
  allowed.rotation.x = -Math.PI / 2;
  orient.add(allowed);

  // Forbidden complement: ring sector covering the remaining sweep, with a
  // hatched material so it visually communicates "off limits."
  const forbiddenGeom = makeRingSectorGeometry(
    JOINT_ARC_RADIUS_MM * 0.78,
    JOINT_ARC_RADIUS_MM,
    rangeRad,
    Math.PI * 2 - rangeRad,
    64,
  );
  const forbiddenMat = makeHatchedMaterial(COLOR_FORBIDDEN);
  const forbidden = new THREE.Mesh(forbiddenGeom, forbiddenMat);
  forbidden.rotation.x = -Math.PI / 2;
  orient.add(forbidden);

  return {
    group,
    dispose() {
      allowedGeom.dispose();
      allowedMat.dispose();
      forbiddenGeom.dispose();
      forbiddenMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Slot ghost — translucent capsule extruded along the slot axis
// ---------------------------------------------------------------------------

function buildSlotGhost(
  feature: SlotFeature,
  constraint?: PartConstraint,
): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = `ghost:${feature.id}`;
  group.position.set(...feature.position_mm);

  const axis = normalizeAxis(feature.axis);
  const halfTravelMm = pickHalfTravelMm(feature.axis, constraint);
  const totalLength = halfTravelMm * 2;

  const capsuleGeom = new THREE.CapsuleGeometry(SLOT_GHOST_RADIUS_MM, totalLength, 8, 16);
  const capsuleMat = new THREE.MeshBasicMaterial({
    color: COLOR_ALLOWED,
    transparent: true,
    opacity: ALLOWED_OPACITY,
    depthWrite: false,
  });
  const capsule = new THREE.Mesh(capsuleGeom, capsuleMat);
  alignYAxisTo(capsule, axis);
  group.add(capsule);

  return {
    group,
    dispose() {
      capsuleGeom.dispose();
      capsuleMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Index ghost — discrete dots at each indexed position
// ---------------------------------------------------------------------------

function buildIndexGhost(
  feature: IndexFeature,
  _constraint?: PartConstraint,
): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = `ghost:${feature.id}`;
  group.position.set(...feature.position_mm);

  const axis = normalizeAxis(feature.axis);
  const oriented = new THREE.Group();
  alignYAxisTo(oriented, axis);
  group.add(oriented);

  const count = Math.max(1, Math.floor(feature.count));
  const ghostGeom = new THREE.SphereGeometry(INDEX_GHOST_DOT_RADIUS_MM, 16, 12);
  const ghostMat = new THREE.MeshBasicMaterial({
    color: COLOR_ALLOWED,
    transparent: true,
    opacity: ALLOWED_OPACITY + 0.1,
    depthWrite: false,
  });

  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const dot = new THREE.Mesh(ghostGeom, ghostMat);
    dot.position.set(
      Math.cos(theta) * INDEX_GHOST_RADIUS_MM,
      0,
      Math.sin(theta) * INDEX_GHOST_RADIUS_MM,
    );
    oriented.add(dot);
  }

  // Thin ring tying the dots together for visual continuity.
  const ringGeom = new THREE.TorusGeometry(INDEX_GHOST_RADIUS_MM, 6, 8, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLOR_ALLOWED,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = Math.PI / 2;
  oriented.add(ring);

  return {
    group,
    dispose() {
      ghostGeom.dispose();
      ghostMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Hatched material — procedural diagonal stripes in fragment space
// ---------------------------------------------------------------------------

function makeHatchedMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: HATCH_OPACITY },
      uStripeWidth: { value: 8.0 },
      uStripeSpacing: { value: 18.0 },
    },
    vertexShader: `
      varying vec3 vPosObj;
      void main() {
        vPosObj = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uStripeWidth;
      uniform float uStripeSpacing;
      varying vec3 vPosObj;
      void main() {
        // Diagonal stripes in the local XY plane of the geometry.
        float v = mod(vPosObj.x + vPosObj.y, uStripeSpacing);
        float onStripe = step(v, uStripeWidth);
        if (onStripe < 0.5) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Geometry + math helpers
// ---------------------------------------------------------------------------

function makeRingSectorGeometry(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
): THREE.RingGeometry {
  const span = endAngle - startAngle;
  return new THREE.RingGeometry(innerRadius, outerRadius, segments, 1, startAngle, span);
}

function pickRotationRangeDeg(
  feature: JointFeature,
  constraint: PartConstraint | undefined,
): number {
  if (!constraint) return DEFAULT_ROTATION_RANGE_DEG;
  const limits = constraint.rotation_max_abs_deg;
  if (!limits) return DEFAULT_ROTATION_RANGE_DEG;
  const a = dominantAxis(feature.axis);
  return limits[a] ?? DEFAULT_ROTATION_RANGE_DEG;
}

function pickHalfTravelMm(featureAxis: Vec3, constraint?: PartConstraint): number {
  if (!constraint) return DEFAULT_SLOT_HALF_TRAVEL_MM;
  const limits = constraint.translation_max_abs_mm;
  if (!limits) {
    return constraint.translation_max_norm_mm ?? DEFAULT_SLOT_HALF_TRAVEL_MM;
  }
  const a = dominantAxis(featureAxis);
  return limits[a] ?? DEFAULT_SLOT_HALF_TRAVEL_MM;
}

function dominantAxis(axis: Vec3): "x" | "y" | "z" {
  const ax = Math.abs(axis[0]);
  const ay = Math.abs(axis[1]);
  const az = Math.abs(axis[2]);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}

function normalizeAxis(v: Vec3): THREE.Vector3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]);
  const len = out.length();
  if (len < 1e-9) return new THREE.Vector3(0, 1, 0);
  return out.divideScalar(len);
}

function alignYAxisTo(obj: THREE.Object3D, axis: THREE.Vector3): void {
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, axis);
  obj.quaternion.copy(q);
}
