// The panel teardown's math layer. There is no math here: it calls the engine. One input, the as-built deviation of
// the hero panel P-05 (dx, dy along the wall in mm; theta about the panel's vertical axis in degrees), goes into
// generateDirectives() exactly the way the viewer sends it, and everything the page shows (directive text, status,
// deviation, expected residual, verdict) is read back from the Step the engine returns. The gauges cannot disagree
// with the motion because both come from the same call.
import {loadToyFacadeFixture} from '../../src/viewer/load-fixture.ts';
import {buildEngineBundle} from '../../src/viewer/engine-bridge.ts';
import {formatDirective} from '../../src/presentation/format-directive.ts';

export const HERO = 'P-05';
export const PANEL = {w: 1500, h: 1000, d: 50, pitchX: 1550, pitchY: 1050};
export const FEATURES = {J1: 'joint', S2: 'slot', P3: 'index'};
// the fixture's own deviation for P-05, the demo's starting point
export const FIXTURE_DEV = {x: 6.5, y: -1.0, deg: 3};
export const DEV_RANGE = {x: 12, y: 12, deg: 10};

const base = loadToyFacadeFixture();
export const PARTS = base.parts.map((p) => ({id: p.partId, t: p.nominal.t.slice()}));

const yQuat = (deg) => {
  const a = (deg * Math.PI) / 360;
  return [0, Math.sin(a), 0, Math.cos(a)];
};

/** a fixture whose P-05 sits at nominal + dev; every other panel keeps the fixture's scan noise */
function withDeviation(dev) {
  return {
    ...base,
    parts: base.parts.map((p) => {
      if (p.partId !== HERO) return p;
      return {
        ...p,
        asBuilt: {t: [p.nominal.t[0] + dev.x, p.nominal.t[1] + dev.y, p.nominal.t[2]], q: yQuat(dev.deg)},
        asBuiltConfidence: 0.91,
      };
    }),
  };
}

/**
 * Run the engine for one deviation. Returns what the page reads:
 *  errNorm, errVec     translation error the engine computed, mm
 *  rotErr              rotation error, degrees
 *  status              ok | pending | clamped | blocked | needs_review
 *  text                formatDirective(step, constraint), installer language
 *  delta               the translation the directive applies, part frame, mm (zeros when none)
 *  toIndex             the index the directive rotates to, or null
 *  residual            expected residual after apply, mm, from the engine's verification block
 *  tol                 acceptance tolerance, mm
 *  verdict             'pass' | 'no' | 'blocked'  (expected_result read against tolerance)
 *  countsByStatus      for the whole 3x3
 */
export function solve(dev) {
  const bundle = buildEngineBundle(withDeviation(dev));
  const step = bundle.stepByPartId.get(HERO);
  const constraint = bundle.constraintById.get(HERO);
  const tr = step.actions.find((a) => a.type === 'translate');
  const ri = step.actions.find((a) => a.type === 'rotate_to_index');
  const ver = step.verification[0];
  const resVec = ver?.expected_residual.translation_mm_vec ?? [0, 0, 0];
  const residual = Math.hypot(resVec[0], resVec[1], resVec[2]);
  const tol = ver?.acceptance.translation_mm ?? constraint.tolerances.translation_mm;
  const verdict = step.status === 'blocked' ? 'blocked' : ver?.expected_result === 'expected_pass' ? 'pass' : 'no';
  return {
    dev,
    errVec: step.computed_errors.translation_error_mm_vec,
    errNorm: step.computed_errors.translation_error_norm_mm,
    rotErr: step.computed_errors.rotation_error_deg,
    status: step.status,
    reasons: step.reason_codes,
    text: formatDirective(step, constraint),
    delta: tr?.delta?.translation_mm ?? [0, 0, 0],
    clamped: !!tr?.clamp_applied,
    toIndex: ri ? ri.target_index : null,
    residual,
    residualVec: resVec,
    tol,
    verdict,
    confidence: step.pose_confidence,
    countsByStatus: bundle.output.summary.counts_by_status,
    beforeMax: bundle.beforeMaxDeviationMm,
    afterMax: bundle.afterMaxDeviationMm,
    features: constraint.features ?? [],
  };
}

/**
 * The hero panel's pose on screen for apply fraction k (0 as built, 1 after the directive). Translation in mm,
 * rotation about y in degrees. The directive's delta is applied in the part frame, which for this fixture is
 * aligned with the world (nominal rotation is identity), so part-frame mm add straight onto world mm.
 */
export function heroPose(sol, k) {
  const {dev, delta, toIndex} = sol;
  const tx = dev.x + k * delta[0];
  const ty = dev.y + k * delta[1];
  const deg = toIndex === null ? dev.deg : dev.deg + k * (toIndex * 90 - dev.deg);
  return {tx, ty, deg};
}
