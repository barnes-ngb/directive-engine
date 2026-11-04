// The panel as a page you drive. Three sliders set the hero panel's as-built deviation; the engine runs on every
// change; the directive, residual and verdict print from its answer; APPLY animates the panel along the directive.
// Camera views, explode, isolate, glass, callouts. Left alone it tours the five beats; any click, drag, wheel or key
// hands control over, 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {BEATS, CAMS, createConsole, TOGGLES} from './console.js';
import {DEV_RANGE, FIXTURE_DEV, heroPose, solve} from './kin.js';
import {createPanelStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const lerp = (a, b, t) => a + (b - a) * t;

const CSS = `
html,body{background:#ecedef;overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.tb{pointer-events:auto;cursor:pointer}
.tb:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:62px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
`;

// camera presets: target in metres (the hero sits at the origin), azimuth, elevation, distance
// distance that makes a height h (m) fill fraction f of the viewport at the stage's vertical fov
const FOV = 28;
const dist = (h, f) => h / f / (2 * Math.tan((FOV * Math.PI) / 360));
const VIEWS = {
  hero: {tx: 0.1, ty: 0.05, tz: 0, az: 0.55, el: 0.22, d: dist(1.0, 0.42), sx: -120, sy: 0},
  front: {tx: 0, ty: 0, tz: 0, az: 0.02, el: 0.04, d: dist(3.1, 0.78), sx: -120, sy: 0},
  side: {tx: 0.1, ty: 0, tz: 0.22, az: 1.38, el: 0.2, d: dist(1.0, 0.42), sx: -120, sy: 0},
  detail: {tx: 0.25, ty: 0, tz: 0, az: 0.8, el: 0.25, d: dist(0.8, 0.5), sx: -120, sy: 20},
};

// the five beats of the tour: when each starts (s), the view, the toggles, the apply fraction target, callouts
const TOUR = [
  {beat: 'detect', at: 0, cam: 'hero', toggles: {callouts: true}, applied: 0, say: 'P-05 is off nominal'},
  {beat: 'constrain', at: 6, cam: 'side', toggles: {explode: true, isolate: true, callouts: true}, applied: 0, say: 'the features the installer can move'},
  {beat: 'directive', at: 13, cam: 'detail', toggles: {isolate: true, glass: true, callouts: true}, applied: 0, say: 'written in J1, S2, P3'},
  {beat: 'apply', at: 19, cam: 'hero', toggles: {callouts: true}, applied: 1, say: 'the panel moves along the directive'},
  {beat: 'verify', at: 25, cam: 'front', toggles: {}, applied: 1, say: 'residual against tolerance'},
];
const TOUR_LEN = 31;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createPanelStage({canvas});
  const ui = createConsole(app);

  // ------------------------------------------------------------ quality and fit
  const TIERS = [
    {samples: 4, shadow: 2048, pr: 2},
    {samples: 2, shadow: 1024, pr: 1.25},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 1 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const {pr, ...q} = TIERS[tier];
  st.setQuality(q);
  fit();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  // ------------------------------------------------------------ state
  const dev = {...FIXTURE_DEV};
  let sol = solve(dev);
  let cam = 'hero';
  const toggles = {explode: false, isolate: false, glass: false, callouts: true};
  let applied = 0;
  let appliedTarget = 0;
  let beat = 'detect';
  let touring = true;
  let tourT = 0;
  let lastInput = performance.now();
  const orbit = {az: 0, el: 0, d: 1};
  const orbitTarget = {az: 0, el: 0, d: 1};
  const camCur = {...VIEWS.hero};
  const anim = {explode: 0, isolate: 0};

  const resolve = () => {
    sol = solve(dev);
  };
  const takeControl = () => {
    if (touring) {
      touring = false;
    }
    lastInput = performance.now();
  };
  const setBeat = (b, fromTour = false) => {
    const step = TOUR.find((t) => t.beat === b);
    beat = b;
    cam = step.cam;
    for (const k of TOGGLES) toggles[k] = !!step.toggles[k];
    appliedTarget = step.applied;
    if (!fromTour) {
      takeControl();
    }
  };

  // ------------------------------------------------------------ input
  for (const k of CAMS) ui.btn[k].onclick = () => {
    cam = k;
    orbitTarget.az = orbitTarget.el = 0;
    orbitTarget.d = 1;
    takeControl();
  };
  for (const k of TOGGLES) ui.btn[k].onclick = () => {
    toggles[k] = !toggles[k];
    takeControl();
  };
  for (const b of BEATS) ui.btn['beat:' + b].onclick = () => setBeat(b);
  ui.btn.apply.onclick = () => {
    appliedTarget = appliedTarget > 0.5 ? 0 : 1;
    takeControl();
  };
  ui.btn.reset.onclick = () => {
    appliedTarget = 0;
    takeControl();
  };
  ui.btn.fixture.onclick = () => {
    Object.assign(dev, FIXTURE_DEV);
    resolve();
    takeControl();
  };
  ui.btn.tour.onclick = () => {
    touring = !touring;
    if (touring) tourT = 0;
    lastInput = performance.now();
  };
  // slider hit zones
  for (const k of ['x', 'y', 'deg']) {
    const s = ui.sliders[k];
    const hit = document.createElement('div');
    hit.className = 'hit';
    Object.assign(hit.style, {left: `${s.x0 - 6}px`, top: `${s.y - 12}px`, width: `${s.w + 12}px`, height: '24px'});
    ui.root.appendChild(hit);
    const set = (cx) => {
      const [sx] = toStage(cx, 0);
      const u = clamp((sx - s.x0) / s.w, 0, 1);
      dev[k] = Math.round(((u - 0.5) * 2 * DEV_RANGE[k]) * 10) / 10;
      appliedTarget = 0;
      resolve();
      takeControl();
    };
    hit.addEventListener('pointerdown', (e) => {
      hit.setPointerCapture(e.pointerId);
      set(e.clientX);
      const mv = (ev) => set(ev.clientX);
      const up = () => {
        hit.removeEventListener('pointermove', mv);
        hit.removeEventListener('pointerup', up);
      };
      hit.addEventListener('pointermove', mv);
      hit.addEventListener('pointerup', up);
    });
  }
  // orbit and zoom on the canvas
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY, az: orbitTarget.az, el: orbitTarget.el};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
    takeControl();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbitTarget.az = drag.az + (e.clientX - drag.x) * 0.006;
    orbitTarget.el = clamp(drag.el + (e.clientY - drag.y) * 0.004, -0.5, 0.9);
    lastInput = performance.now();
  });
  canvas.addEventListener('pointerup', () => {
    drag = null;
    canvas.classList.remove('drag');
  });
  canvas.addEventListener('wheel', (e) => {
    orbitTarget.d = clamp(orbitTarget.d * (1 + e.deltaY * 0.001), 0.35, 2.2);
    takeControl();
    e.preventDefault();
  }, {passive: false});
  let hudOn = true;
  let dbgOn = false;
  addEventListener('keydown', (e) => {
    if (e.key === 'd') dbgOn = !dbgOn;
    else if (e.key === 'h') {
      hudOn = !hudOn;
      ui.root.style.display = hudOn ? 'block' : 'none';
    } else if (e.key === ' ') ui.btn.apply.onclick();
    else if (/^[1-5]$/.test(e.key)) setBeat(BEATS[+e.key - 1]);
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ frame
  let last = performance.now();
  const MM = 0.001;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!touring && now - lastInput > IDLE * 1000) {
      touring = true;
      tourT = 0;
    }
    if (touring) {
      tourT = (tourT + dt) % TOUR_LEN;
      let cur = TOUR[0];
      for (const t of TOUR) if (tourT >= t.at) cur = t;
      if (cur.beat !== beat) setBeat(cur.beat, true);
      orbitTarget.az = Math.sin(tourT * 0.35) * 0.08;
      orbitTarget.el = 0;
      orbitTarget.d = 1;
    }
    // eased state
    const k = 1 - Math.exp(-dt * 5);
    applied = lerp(applied, appliedTarget, k);
    anim.explode = lerp(anim.explode, toggles.explode ? 1 : 0, k);
    anim.isolate = lerp(anim.isolate, toggles.isolate ? 1 : 0, k);
    orbit.az = lerp(orbit.az, orbitTarget.az, k);
    orbit.el = lerp(orbit.el, orbitTarget.el, k);
    orbit.d = lerp(orbit.d, orbitTarget.d, k);
    const V = VIEWS[cam];
    for (const key of Object.keys(V)) camCur[key] = lerp(camCur[key], V[key], k * 0.7);
    const camNow = {...camCur, az: camCur.az + orbit.az, el: camCur.el + orbit.el, d: camCur.d * orbit.d};

    const pose = heroPose(sol, smoother(applied));
    const hl = beat === 'constrain' ? 'S2' : beat === 'directive' ? 'P3' : null;
    st.frame({pose, explode: anim.explode, isolate: anim.isolate, highlight: hl, ghost: toggles.glass}, camNow);

    // callouts: the three features, leaders into the hero
    const callouts = [];
    if (toggles.callouts) {
      const defs = [
        ['J1', 'joint · hinge', [1040, 300]],
        ['S2', 'slot · ±10 mm', [1040, 420]],
        ['P3', 'index · 4 × 90°', [1040, 540]],
      ];
      for (const [id, sub, label] of defs) {
        const p = st.fac.featureWorld(id);
        const at = st.project(p[0], p[1], p[2]);
        callouts.push({name: id, sub, at, label, w: 90, o: at ? 1 : 0});
      }
    }
    const hp = st.fac.hero.position;
    const cp = st.camera.position;
    const pj = (id) => {
      const p = st.fac.featureWorld(id);
      const q = st.project(p[0], p[1], p[2]);
      return `${id} w(${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}) s(${q ? q.map((v) => v.toFixed(0)).join(',') : 'off'})`;
    };
    const debug = `cam (${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)}) d=${camNow.d.toFixed(2)} az=${camNow.az.toFixed(2)}  hero (${hp.x.toFixed(3)},${hp.y.toFixed(3)},${hp.z.toFixed(3)})  ${pj('J1')}  ${pj('S2')}  ${pj('P3')}`;
    ui.update({sol, cam, toggles, applied, beat, touring, callouts, scale, debug: dbgOn ? debug : ''});
    requestAnimationFrame(loop);
  };
  (async () => {
    try {
      await warmComposer(st.renderer, st.composer, st.scene, st.camera);
    } catch (e) {
      console.warn('warm skipped', e);
    }
    requestAnimationFrame(loop);
  })();
}
