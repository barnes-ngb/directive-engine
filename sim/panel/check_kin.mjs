// The instrument for the sim's math layer: runs kin.js's solve() on a ladder of deviations and asserts the hero
// case reproduces datasets/toy_facade_v1/expected_directives.json. Run with:  npx tsx sim/panel/check_kin.mjs
import fs from 'node:fs';
import {solve, heroPose, FIXTURE_DEV} from './kin.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../datasets/toy_facade_v1/expected_directives.json', import.meta.url), 'utf8'));
const e5 = expected.steps.find((s) => s.partId === 'P-05');

const ladder = [
  {x: 0.4, y: 0.2, deg: 0},
  {x: 3.5, y: 0, deg: 0},
  FIXTURE_DEV,
  {x: 11, y: 0, deg: 0},
  {x: -9, y: 9, deg: -10},
];
let fail = 0;
for (const dev of ladder) {
  const r = solve(dev);
  const after = heroPose(r, 1);
  console.log(`dev (${dev.x}, ${dev.y}, ${dev.deg}°)  err ${r.errNorm.toFixed(2)} mm  ${r.status.padEnd(8)}  verdict ${r.verdict.padEnd(7)}  after apply (${after.tx.toFixed(1)}, ${after.ty.toFixed(1)}, ${after.deg.toFixed(1)}°)`);
  console.log(`   ${r.text}`);
  // a pass verdict must leave the panel within tolerance of nominal; a blocked one must not move it at all
  const residualAfter = Math.hypot(after.tx, after.ty);
  if (r.verdict === 'pass' && residualAfter > r.tol + 1e-9) {
    console.log(`   FAIL: verdict pass but the applied pose is ${residualAfter.toFixed(2)} mm from nominal`);
    fail++;
  }
  if (r.status === 'blocked' && (after.tx !== dev.x || after.ty !== dev.y)) {
    console.log('   FAIL: blocked step moved the panel');
    fail++;
  }
}
const r = solve(FIXTURE_DEV);
const ok =
  Math.abs(r.errNorm - e5.computedDeviationMm) < 0.05 &&
  r.status === e5.status &&
  r.delta[0] === e5.actions[0].vectorMm[0] &&
  r.delta[1] === e5.actions[0].vectorMm[1] &&
  r.toIndex === e5.actions[1].targetIndex;
console.log(`\nhero case matches expected_directives.json: ${ok}`);
if (!ok) fail++;
process.exit(fail ? 1 : 0);
