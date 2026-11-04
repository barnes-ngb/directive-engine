// The facade in three.js: a wall, nine panels on their anchors, the hero panel P-05 as separate parts that can be
// exploded and isolated: the slab, the hinge at J1 (right edge), the slot bracket S2 behind the centre, the four
// bolts of the P3 index pattern. Scene units are metres; the fixture is mm. update(state) poses everything.
import * as THREE from 'three';
import {HERO, PANEL, PARTS} from './kin.js';

const MM = 0.001;
export const ACCENT = '#d6182b';
const INK = '#16181b';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.55, metalness: 0.08, envMapIntensity: 0.5, ...o});
const box = (w, h, d, m) => {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
};
const cyl = (r, h, m, seg = 24) => {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
};

export function buildFacade() {
  const root = new THREE.Group();
  const W = PANEL.w * MM;
  const H = PANEL.h * MM;
  const D = PANEL.d * MM;

  // wall: a slab behind the panels, with a darker reveal so the gaps read
  const wall = box(5.4, 3.9, 0.12, mat('#d8d9dc', {roughness: 0.9}));
  wall.position.z = -0.16;
  root.add(wall);

  const panelMat = mat('#f4f4f3', {roughness: 0.42});
  const heroMat = mat('#f4f4f3', {roughness: 0.42});
  const steel = mat('#8e949b', {roughness: 0.5, metalness: 0.6});
  const accent = mat(ACCENT, {roughness: 0.5});
  const ghost = mat('#f4f4f3', {roughness: 0.42, transparent: true, opacity: 0.12});

  const others = [];
  const hero = new THREE.Group();
  const parts = {};
  for (const p of PARTS) {
    const px = p.t[0] * MM;
    const py = p.t[1] * MM;
    if (p.id !== HERO) {
      const g = box(W, H, D, panelMat);
      g.position.set(px, py, 0);
      g.userData.id = p.id;
      root.add(g);
      others.push(g);
      // two anchor studs per panel, so the wall reads as populated
      for (const sx of [-0.45, 0.45]) {
        const a = cyl(0.012, 0.09, steel, 12);
        a.rotation.x = Math.PI / 2;
        a.position.set(px + sx, py, -0.08);
        root.add(a);
      }
      continue;
    }
    hero.position.set(px, py, 0);
  }

  // hero panel parts, in the panel's part frame (origin at panel centre, x along width, y up, z out of the wall)
  parts.slab = box(W, H, D, heroMat);
  parts.slab.position.z = 0;
  const slabEdge = new THREE.LineSegments(new THREE.EdgesGeometry(parts.slab.geometry), new THREE.LineBasicMaterial({color: INK, transparent: true, opacity: 0.35}));
  parts.slab.add(slabEdge);
  hero.add(parts.slab);

  // J1: hinge at the right edge, a vertical pin with two knuckles
  const j1 = new THREE.Group();
  const pin = cyl(0.009, H * 0.86, steel, 20);
  j1.add(pin);
  for (const sy of [-0.32, 0.32]) {
    const k = cyl(0.018, 0.09, steel, 20);
    k.position.y = sy;
    j1.add(k);
  }
  j1.position.set(W / 2 + 0.02, 0, -0.03);
  parts.J1 = j1;
  hero.add(j1);

  // S2: the slot bracket behind the centre, a plate with a lateral slot cut as two rails
  const s2 = new THREE.Group();
  const plate = box(0.34, 0.16, 0.016, steel);
  s2.add(plate);
  const slotTop = box(0.26, 0.014, 0.018, accent);
  slotTop.position.set(0, 0.04, 0.002);
  const slotBot = box(0.26, 0.014, 0.018, accent);
  slotBot.position.set(0, -0.04, 0.002);
  s2.add(slotTop, slotBot);
  s2.position.set(0, 0, -D / 2 - 0.012);
  parts.S2 = s2;
  hero.add(s2);

  // P3: four bolts in a square pattern about the panel's vertical axis, the locking bolt lit
  const p3 = new THREE.Group();
  const R = 0.11;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const b = cyl(0.016, 0.07, i === 0 ? accent : steel, 12);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    p3.add(b);
  }
  p3.position.set(0, 0, -D / 2 - 0.04);
  parts.P3 = p3;
  hero.add(p3);

  // wall anchors behind the hero, fixed to the wall, not to the panel: they show where nominal is
  const anchors = new THREE.Group();
  for (const [sx, sy] of [[-0.45, 0.3], [0.45, 0.3], [-0.45, -0.3], [0.45, -0.3]]) {
    const a = cyl(0.012, 0.09, steel, 12);
    a.rotation.x = Math.PI / 2;
    a.position.set(hero.position.x + sx, hero.position.y + sy, -0.08);
    anchors.add(a);
  }
  root.add(anchors);

  // a thin nominal outline on the wall behind the hero: where the panel should be
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H)),
    new THREE.LineBasicMaterial({color: INK, transparent: true, opacity: 0.55}),
  );
  outline.position.set(hero.position.x, hero.position.y, -0.098);
  root.add(outline);

  root.add(hero);

  // feature anchor points in world space, for the console's callouts: computed from the posed hero
  const tmp = new THREE.Vector3();
  const featureWorld = (id) => {
    const n = id === 'J1' ? parts.J1 : id === 'S2' ? parts.S2 : id === 'P3' ? parts.P3 : parts.slab;
    n.getWorldPosition(tmp);
    return [tmp.x, tmp.y, tmp.z];
  };

  // explode offsets along +z (out of the wall), metres, scaled by state.explode 0..1
  const EXPLODE = {slab: 0.5, J1: 0.22, S2: 0.1, P3: 0.3};
  const home = {slab: parts.slab.position.clone(), J1: parts.J1.position.clone(), S2: parts.S2.position.clone(), P3: parts.P3.position.clone()};

  /**
   * state: {pose: {tx, ty, deg} mm/deg for the hero relative to nominal; explode 0..1; isolate 0..1;
   *         highlight: 'J1'|'S2'|'P3'|null; ghost: boolean (hero drawn as glass to show the bracket)}
   */
  const update = (s) => {
    const nom = PARTS.find((p) => p.id === HERO).t;
    hero.position.set((nom[0] + s.pose.tx) * MM, (nom[1] + s.pose.ty) * MM, 0);
    hero.rotation.set(0, (s.pose.deg * Math.PI) / 180, 0);
    for (const k of Object.keys(EXPLODE)) {
      parts[k].position.copy(home[k]);
      parts[k].position.z += EXPLODE[k] * s.explode;
    }
    const iso = s.isolate;
    for (const g of others) {
      g.material = iso > 0.5 ? ghost : panelMat;
    }
    wall.material.opacity = 1;
    parts.slab.material = s.ghost ? ghost : heroMat;
    const hl = s.highlight;
    for (const k of ['J1', 'S2', 'P3']) {
      parts[k].scale.setScalar(k === hl ? 1.18 : 1);
    }
  };

  return {root, hero, parts, others, featureWorld, update, PANEL_M: {W, H, D}};
}
