import type { Vec3 } from "../types.js";

export function roundScalar(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundVec(v: Vec3, decimals: number): Vec3 {
  return [
    roundScalar(v[0], decimals),
    roundScalar(v[1], decimals),
    roundScalar(v[2], decimals)
  ];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function norm(v: Vec3): number {
  return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

export function clampVecPerAxis(v: Vec3, maxAbs: Vec3): { clamped: Vec3; changed: boolean } {
  let changed = false;
  const out: Vec3 = [v[0], v[1], v[2]];
  for (let i = 0; i < 3; i++) {
    const m = Math.abs(maxAbs[i]);
    if (m === 0) continue;
    const before = out[i];
    if (out[i] > m) out[i] = m;
    if (out[i] < -m) out[i] = -m;
    if (out[i] !== before) changed = true;
  }
  return { clamped: out, changed };
}
