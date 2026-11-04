// The overlay, a fixed 1600 x 900 layout. Left: title, the deviation as the one input (three sliders), the DOF card.
// Right: the directive card, the verification readout (residual against tolerance, verdict), camera and part
// toggles. Bottom centre: the five beats. Callouts with leaders into the hero panel. update(s) redraws it all from
// the frame's state; nothing here computes anything, it prints what kin.js returned.
import {DEV_RANGE} from './kin.js';

export const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', green: '#2f8f5b', amber: '#c98a12', grey: '#5d6670'};
export const CAMS = ['hero', 'front', 'side', 'detail'];
export const TOGGLES = ['explode', 'isolate', 'glass', 'callouts'];
export const BEATS = ['detect', 'constrain', 'directive', 'apply', 'verify'];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.mono{font-family:'JetBrains Mono',monospace}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.chip{display:inline-block;height:17px;line-height:17px;padding:0 7px;border:1px solid ${C.line};font-size:8.6px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const STATUS_COLOR = {ok: C.green, pending: C.amber, clamped: C.amber, blocked: C.red, needs_review: C.grey};

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const btn = {};

  // ------------------------------------------------------------ title and the deviation readout
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">Directive Engine <span style="color:${C.red}">·</span> Panel</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">TOY_FACADE_V1 &nbsp;•&nbsp; 3 × 3 &nbsp;•&nbsp; HERO P-05 &nbsp;•&nbsp; TOL ±2.0 MM</div>`);
  const devBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3.2px;color:${C.red};line-height:1"></div>`);
  const devUnit = add(`<div style="position:absolute;top:128px;font-size:11px;font-weight:500;letter-spacing:1px;line-height:1.35">MM<br><span style="color:${C.mute};letter-spacing:1.5px">DEVIATION</span></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const devFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  const tolTick = add(`<div style="position:absolute;top:169px;width:2px;height:19px;background:${C.ink}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;left:258px;top:188px;font-size:9px;font-weight:500">12</div>`);
  const tolLbl = add(`<div class="cp" style="position:absolute;top:188px;font-size:9px;font-weight:500;color:${C.ink}">TOL</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  const statusLine = add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500"></div>`);

  // ------------------------------------------------------------ the one input
  add(`<div class="pn" style="left:35px;top:262px;width:247px;height:168px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:274px;font-weight:700">AS-BUILT DEVIATION</div>`);
  add(`<div class="cp mu" style="position:absolute;left:46px;top:289px;font-size:8.6px;font-weight:500">THE ONE INPUT · DRAG</div>`);
  const SL = {x: 46, w: 226};
  const sliders = {};
  [['x', 'ALONG S2 (X)', 'mm', 312], ['y', 'VERTICAL (Y)', 'mm', 350], ['deg', 'ABOUT P3 (Y AXIS)', '°', 388]].forEach(([k, name, unit, y]) => {
    add(`<div class="cp" style="position:absolute;left:46px;top:${y}px;font-weight:500">${name}</div>`);
    const val = add(`<div class="cp" style="position:absolute;right:${1600 - 272}px;top:${y}px;font-weight:700"></div>`);
    add(`<div style="position:absolute;left:${SL.x}px;top:${y + 19}px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
    add(`<div style="position:absolute;left:${SL.x + SL.w / 2 - 0.5}px;top:${y + 15}px;width:1px;height:10px;background:${C.faint}"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 14}px;width:9px;height:11px;margin-left:-4.5px;background:${C.red}"></div>`);
    sliders[k] = {val, knob, unit, y: y + 19};
  });
  add(`<div class="cp mu" style="position:absolute;left:46px;top:412px;font-size:8.6px;font-weight:500">P-05 ONLY · THE OTHER EIGHT KEEP THEIR SCAN NOISE</div>`);

  // ------------------------------------------------------------ DOF card
  add(`<div class="pn" style="left:35px;top:440px;width:247px;height:150px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:452px;font-weight:700">DECLARED FEATURES</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 272}px;top:452px;font-weight:500">PART FRAME</div>`);
  const dof = add(`<div style="position:absolute;left:46px;top:470px;width:226px;font-size:10.5px;line-height:1.5"></div>`);
  dof.innerHTML = [
    ['J1', 'joint', 'hinge at the right edge, pivot about +Y'],
    ['S2', 'slot', 'lateral mounting slot, ±10 mm along X'],
    ['P3', 'index', 'four-position bolt pattern about +Y'],
  ].map(([id, kind, d]) => `<div style="display:flex;gap:8px;margin-bottom:6px"><b class="mono" style="color:${C.red};width:22px">${id}</b><span><b style="font-weight:600">${kind}</b><br><span style="color:${C.mute};font-size:9.5px">${d}</span></span></div>`).join('');
  add(`<div class="cp mu" style="position:absolute;left:46px;top:568px;font-size:8.6px;font-weight:500">DIRECTIVES ARE WRITTEN IN THESE, NOT IN AXES</div>`);

  // ------------------------------------------------------------ directive card
  add(`<div class="pn" style="left:1296px;top:36px;width:268px;height:176px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1307px;top:47px;font-weight:700">DIRECTIVE · P-05</div>`);
  const statusChip = add(`<div class="chip" style="position:absolute;right:${1600 - 1553}px;top:44px"></div>`);
  const dirText = add(`<div style="position:absolute;left:1307px;top:68px;width:246px;font-size:12.5px;line-height:1.45;font-weight:500"></div>`);
  const dirFoot = add(`<div class="cp mu" style="position:absolute;left:1307px;top:190px;font-size:8.6px;font-weight:500"></div>`);

  // ------------------------------------------------------------ verification readout
  add(`<div class="pn" style="left:1296px;top:220px;width:268px;height:214px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1307px;top:231px;font-weight:700">VERIFICATION</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 1553}px;top:231px;font-weight:500">MEASURE_POSE</div>`);
  const resBig = add(`<div style="position:absolute;left:1306px;top:248px;font-size:36px;font-weight:800;letter-spacing:-1.6px;line-height:1"></div>`);
  const resUnit = add(`<div style="position:absolute;top:262px;font-size:10.5px;font-weight:500;letter-spacing:1px;line-height:1.35">MM<br><span style="color:${C.mute};letter-spacing:1.5px">RESIDUAL</span></div>`);
  const scale = add(`<svg style="position:absolute;left:1304px;top:296px" width="252" height="52"></svg>`);
  const verdictRow = add(`<div style="position:absolute;left:1307px;top:356px;display:flex;gap:6px"></div>`);
  const beforeAfter = add(`<div class="cp mu" style="position:absolute;left:1307px;top:386px;font-size:8.8px;font-weight:500;line-height:1.7"></div>`);

  // ------------------------------------------------------------ camera and parts
  add(`<div class="pn" style="left:1296px;top:720px;width:268px;height:165px"></div>`);
  const group = (title, keys, y) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${y}px;font-weight:500">${title}</div>`);
    let x = 1305;
    let yy = y + 15;
    keys.forEach((k) => {
      const w = Math.round(k.length * 6.2 + 14);
      if (x + w > 1556) {
        x = 1305;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${k.toUpperCase()}</div>`);
      x += w + 4;
    });
  };
  group('CAMERA', CAMS, 727);
  group('PARTS', TOGGLES, 771);
  add(`<div class="cp mu" style="position:absolute;left:1305px;top:815px;font-weight:500">APPLY</div>`);
  btn.apply = add(`<div class="tb" style="left:1305px;top:830px;width:118px;height:26px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.6px">▶ &nbsp;APPLY DIRECTIVE</div>`);
  btn.reset = add(`<div class="tb" style="left:1428px;top:830px;width:70px;height:26px;font-size:9.6px">AS BUILT</div>`);
  btn.fixture = add(`<div class="tb" style="left:1503px;top:830px;width:52px;height:26px;font-size:9.6px">FIX</div>`);

  // ------------------------------------------------------------ beats
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">FIVE BEATS</span> &nbsp;— &nbsp;CLICK TO JUMP</div>`);
  const beatRow = add(`<div style="position:absolute;left:0;right:0;top:816px;display:flex;justify-content:center;gap:4px"></div>`);
  BEATS.forEach((b) => {
    btn['beat:' + b] = el(`<div class="tb" style="position:relative;left:0;top:0;width:92px">${b.toUpperCase()}</div>`);
    beatRow.appendChild(btn['beat:' + b]);
  });
  const tourChip = add(`<div class="tourchip"><i></i><span>AUTO TOUR · CLICK TO TAKE CONTROL</span></div>`);
  btn.tour = tourChip;
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; H HIDES THE OVERLAY</div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:862px;font-size:8.6px;font-weight:500">EVERY NUMBER ON THIS PAGE IS READ FROM generateDirectives() · 188 TESTS · MIT</div>`);

  // ------------------------------------------------------------ callouts
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);

  const knobX = (k, v) => SL.x + ((v / DEV_RANGE[k]) * 0.5 + 0.5) * SL.w;
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };

  return {
    btn,
    root: ui,
    sliders: Object.fromEntries(Object.entries(sliders).map(([k, s]) => [k, {y: s.y, x0: SL.x, w: SL.w}])),
    knobX,
    centre,
    update(s) {
      const sol = s.sol;
      // deviation readout
      devBig.textContent = sol.errNorm.toFixed(1);
      devUnit.style.left = `${38 + devBig.getBoundingClientRect().width / s.scale + 8}px`;
      devFill.style.width = `${Math.min(247, (sol.errNorm / 12) * 247).toFixed(1)}px`;
      devFill.style.background = sol.errNorm <= sol.tol ? C.green : sol.status === 'blocked' ? C.red : C.amber;
      const tx = 35 + (sol.tol / 12) * 247;
      tolTick.style.left = `${tx.toFixed(1)}px`;
      tolLbl.style.left = `${(tx - 8).toFixed(1)}px`;
      statusLine.innerHTML = `Status <b style="color:${STATUS_COLOR[sol.status]}">${sol.status}</b> &nbsp;·&nbsp; rotation <b>${sol.rotErr.toFixed(1)}°</b> &nbsp;·&nbsp; conf <b>${(sol.confidence ?? 0).toFixed(2)}</b>`;
      // sliders
      for (const k of ['x', 'y', 'deg']) {
        const v = sol.dev[k];
        sliders[k].val.innerHTML = `${v >= 0 ? '+' : ''}${v.toFixed(1)}<span class="mu"> ${sliders[k].unit}</span>`;
        sliders[k].knob.style.left = `${knobX(k, v).toFixed(1)}px`;
      }
      // directive
      statusChip.textContent = sol.status;
      statusChip.style.color = STATUS_COLOR[sol.status];
      statusChip.style.borderColor = STATUS_COLOR[sol.status];
      dirText.innerHTML = sol.text.replace(/\((Lateral[^)]*|Four-position[^)]*|Hinge[^)]*)\)/g, '').replace(/\. /g, '.<br>');
      dirFoot.textContent = sol.reasons.join(' · ').replace(/_/g, ' ');
      // verification
      const shown = s.applied > 0.999 ? sol.residual : sol.errNorm;
      resBig.textContent = shown.toFixed(1);
      resBig.style.color = shown <= sol.tol ? C.green : C.red;
      resUnit.style.left = `${1310 + resBig.getBoundingClientRect().width / s.scale + 8}px`;
      resUnit.innerHTML = `MM<br><span style="color:${C.mute};letter-spacing:1.5px">${s.applied > 0.999 ? 'RESIDUAL · AFTER' : 'DEVIATION · BEFORE'}</span>`;
      {
        const X = (v) => 14 + Math.min(1, v / 12) * 224;
        let h = `<line x1="${X(0)}" x2="${X(12)}" y1="26" y2="26" stroke="${C.ink}" stroke-width=".8"/>`;
        for (let i = 0; i <= 12; i++) h += `<line x1="${X(i)}" x2="${X(i)}" y1="26" y2="${i % 2 ? 22 : 18}" stroke="${C.ink}" stroke-width=".8"/>`;
        h += `<text x="${X(0)}" y="40" font-size="7" text-anchor="middle" fill="${C.mute}">0</text><text x="${X(12)}" y="40" font-size="7" text-anchor="middle" fill="${C.mute}">12 mm</text>`;
        h += `<line x1="${X(sol.tol)}" x2="${X(sol.tol)}" y1="4" y2="34" stroke="${C.ink}" stroke-width="1" stroke-dasharray="3 3"/><text x="${X(sol.tol) + 4}" y="10" font-size="7" fill="${C.mute}">tol ${sol.tol.toFixed(1)}</text>`;
        h += `<line x1="${X(10)}" x2="${X(10)}" y1="12" y2="34" stroke="${C.red}" stroke-width="1" stroke-dasharray="2 2"/><text x="${X(10) - 4}" y="48" font-size="7" text-anchor="end" fill="${C.red}">limit 10</text>`;
        h += `<circle cx="${X(sol.errNorm)}" cy="26" r="3.5" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`;
        h += `<circle cx="${X(shown)}" cy="26" r="4.5" fill="${shown <= sol.tol ? C.green : C.red}"/>`;
        scale.innerHTML = h;
      }
      {
        const v = s.applied > 0.999 ? sol.verdict : 'pending';
        const states = [['pass', C.green], ['no', C.red], ['blocked', C.red], ['pending', C.amber]];
        verdictRow.innerHTML = states.map(([n, c]) => `<span class="chip" style="${n === v ? `color:${c};border-color:${c};border-width:1.5px` : `color:${C.faint}`}">${n}</span>`).join('');
      }
      beforeAfter.innerHTML = `BEFORE <b style="color:${C.ink}">${sol.errNorm.toFixed(1)}</b> MM &nbsp;→&nbsp; EXPECTED AFTER <b style="color:${C.ink}">${sol.residual.toFixed(1)}</b> MM<br>FACADE · OK <b style="color:${C.ink}">${sol.countsByStatus.ok}</b> · PENDING <b style="color:${C.ink}">${sol.countsByStatus.pending}</b> · BLOCKED <b style="color:${C.ink}">${sol.countsByStatus.blocked}</b>`;
      // toggles
      const on = (n, yes, col = C.ink) => {
        n.style.background = yes ? col : '#fff';
        n.style.color = yes ? '#fff' : C.ink;
        n.style.borderColor = yes ? col : C.line;
      };
      for (const k of CAMS) on(btn[k], s.cam === k);
      for (const k of TOGGLES) on(btn[k], !!s.toggles[k], C.red);
      for (const b of BEATS) on(btn['beat:' + b], s.beat === b);
      btn.apply.innerHTML = s.applied > 0.999 ? '↺ &nbsp;UNDO APPLY' : '▶ &nbsp;APPLY DIRECTIVE';
      tourChip.classList.toggle('on', s.touring);
      tourChip.querySelector('span').textContent = s.touring ? 'AUTO TOUR · CLICK TO TAKE CONTROL' : 'YOUR CONTROL · TOUR RESUMES WHEN IDLE';
      // callouts
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${(ly + 16).toFixed(1)} ${(lx + c.w).toFixed(1)},${(ly + 16).toFixed(1)}" fill="none" stroke="${C.mute}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
    },
  };
}
