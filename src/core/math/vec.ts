import type { Vec3 } from "../types.js";

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

export function clampScalar(value: number, min: number, max: number): number {
  if (min > max) {
    [min, max] = [max, min];
  }
  return Math.min(Math.max(value, min), max);
}

export function roundVec(v: Vec3, precision = 1e-9): Vec3 {
  if (precision <= 0) return [v[0], v[1], v[2]];
  const roundScalar = (value: number): number => {
    if (!Number.isFinite(value)) return value;
    const rounded = Math.round(value / precision) * precision;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  return [roundScalar(v[0]), roundScalar(v[1]), roundScalar(v[2])];
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
