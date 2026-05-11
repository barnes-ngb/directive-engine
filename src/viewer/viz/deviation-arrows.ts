/**
 * Deviation arrows: 3D cone-tipped arrows pointing from each panel's nominal
 * centroid to its as-built centroid, color-graded by deviation magnitude.
 *
 * Beat usage (driven from `src/viewer/index.ts`):
 *   - Beat 1: hidden (the intro frame is calm; deviations are conveyed by
 *     panel tint)
 *   - Beats 2-3: visible at full scale
 *   - Beat 4: shrunk to zero by `arrow-tween` during the Apply animation
 *   - Beat 5: hidden
 *
 * Color bands (relative to the panel's translation tolerance):
 *   - ≤ 1×  tolerance: arrow omitted (within tolerance — no narrative weight)
 *   - 1×..2× tolerance: yellow (`0xfacc15`)
 *   - > 2×  tolerance: red    (`0xef4444`)
 */

import * as THREE from "three";
import type { EngineBundle } from "../engine-bridge.js";
import type { FacadeFixture, FacadePart } from "../load-fixture.js";

const COLOR_WARN = 0xfacc15;
const COLOR_SEVERE = 0xef4444;

/** Minimum arrow length so tiny deviations are still readable (mm). */
const MIN_ARROW_LENGTH_MM = 80;
/**
 * Visual exaggeration: 1× of the underlying deviation. Real residuals (a few
 * mm) are dwarfed by panel size (~1500 mm), so we scale up so the arrow is
 * actually legible against the panel. Length is clamped between
 * `MIN_ARROW_LENGTH_MM` and the panel's larger half-extent.
 */
const ARROW_SCALE = 40;
const HEAD_LENGTH_RATIO = 0.28;
const HEAD_WIDTH_RATIO = 0.18;

export interface DeviationArrowsHandle {
  /** Top-level group; toggle `.visible` or set `.scale.setScalar(s)` to fade. */
  group: THREE.Group;
  /** Sub-arrow groups keyed by part ID. Useful for per-arrow tweens. */
  byPartId: Map<string, THREE.Group>;
  /** Releases GPU resources for every arrow primitive. */
  dispose(): void;
}

/**
 * Build a `THREE.Group` containing one `ArrowHelper` per deviated panel.
 * Arrows are placed in world space using each panel's nominal centroid as
 * the origin and pointing toward the as-built centroid.
 *
 * Panels whose deviation is within tolerance get no arrow.
 */
export function buildDeviationArrows(
  fixture: FacadeFixture,
  bundle: EngineBundle,
): DeviationArrowsHandle {
  const group = new THREE.Group();
  group.name = "deviation-arrows";
  const byPartId = new Map<string, THREE.Group>();
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  for (const part of fixture.parts) {
    const arrow = tryBuildArrow(part, bundle, disposables);
    if (!arrow) continue;
    group.add(arrow);
    byPartId.set(part.partId, arrow);
  }

  return {
    group,
    byPartId,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

function tryBuildArrow(
  part: FacadePart,
  bundle: EngineBundle,
  disposables: Array<THREE.BufferGeometry | THREE.Material>,
): THREE.Group | null {
  const step = bundle.stepByPartId.get(part.partId);
  if (!step || step.status === "ok") return null;
  if (!part.asBuilt) return null;

  const tolerance = bundle.constraintById.get(part.partId)?.tolerances.translation_mm ?? 2.0;
  const mag = step.computed_errors.translation_error_norm_mm;
  if (mag <= tolerance) return null;

  const color = mag > 2 * tolerance ? COLOR_SEVERE : COLOR_WARN;

  const nominal = new THREE.Vector3(...part.nominal.t);
  const asBuilt = new THREE.Vector3(...part.asBuilt.t);
  const dir = new THREE.Vector3().subVectors(asBuilt, nominal);
  const distance = dir.length();
  if (distance < 1e-6) return null;
  dir.normalize();

  const length = Math.max(MIN_ARROW_LENGTH_MM, distance * ARROW_SCALE);
  const headLength = length * HEAD_LENGTH_RATIO;
  const headWidth = length * HEAD_WIDTH_RATIO;

  const arrow = new THREE.ArrowHelper(dir, nominal, length, color, headLength, headWidth);
  // ArrowHelper materials are LineBasicMaterial (shaft) + MeshBasicMaterial (head).
  // Tag both as transparent so the runner can fade them in parallel with scale.
  const lineMat = arrow.line.material as THREE.LineBasicMaterial;
  const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
  lineMat.transparent = true;
  lineMat.depthTest = true;
  coneMat.transparent = true;
  coneMat.depthTest = true;
  disposables.push(arrow.line.geometry, lineMat);
  disposables.push(arrow.cone.geometry, coneMat);

  const wrapper = new THREE.Group();
  wrapper.name = `arrow:${part.partId}`;
  wrapper.userData.partId = part.partId;
  wrapper.add(arrow);
  return wrapper;
}

/**
 * Apply a uniform scale (and matching opacity) to an arrow group. Used by
 * `arrow-tween` during beat-4 Apply.
 */
export function setArrowScale(arrow: THREE.Group, scale: number): void {
  const s = Math.max(0, Math.min(1, scale));
  arrow.scale.setScalar(s);
  arrow.traverse((obj) => {
    const m = (obj as THREE.Mesh | THREE.Line).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!m) return;
    if (Array.isArray(m)) {
      for (const mm of m) mm.opacity = s;
    } else if ("opacity" in m) {
      (m as { opacity: number }).opacity = s;
    }
  });
}
