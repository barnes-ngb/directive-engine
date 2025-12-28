import type { Quat, Vec3 } from "../types.js";

export function normalize(q: Quat): Quat {
  const [x,y,z,w] = q;
  const n = Math.sqrt(x*x + y*y + z*z + w*w);
  if (n === 0) return [0,0,0,1];
  return [x/n, y/n, z/n, w/n];
}

export function deltaQuat(nominal: Quat, asBuilt: Quat): Quat {
  return normalize(multiply(nominal, inverse(asBuilt)));
}

export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function inverse(q: Quat): Quat {
  // For unit quaternions, inverse == conjugate
  const qq = normalize(q);
  return conjugate(qq);
}

export function multiply(a: Quat, b: Quat): Quat {
  // Hamilton product, assumes [x,y,z,w]
  const ax=a[0], ay=a[1], az=a[2], aw=a[3];
  const bx=b[0], by=b[1], bz=b[2], bw=b[3];
  const x = aw*bx + ax*bw + ay*bz - az*by;
  const y = aw*by - ax*bz + ay*bw + az*bx;
  const z = aw*bz + ax*by - ay*bx + az*bw;
  const w = aw*bw - ax*bx - ay*by - az*bz;
  return [x,y,z,w];
}

export function angleDeg(q: Quat): number {
  // Returns 0..180 degrees for the equivalent rotation angle.
  // Normalize to [0,180] (for unit quaternion, acos gives [0,pi])
  return toAxisAngle(q).angleDeg;
}

export function toAxisAngle(q: Quat): { axis: Vec3; angleDeg: number } {
  const qq = normalize(q);
  const wClamped = Math.max(-1, Math.min(1, qq[3]));
  const sign = wClamped < 0 ? -1 : 1;
  const x = qq[0] * sign;
  const y = qq[1] * sign;
  const z = qq[2] * sign;
  const w = wClamped * sign;
  const angleRad = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w*w));
  const axis: Vec3 = sinHalf < 1e-8 ? [1, 0, 0] : [x / sinHalf, y / sinHalf, z / sinHalf];
  return { axis, angleDeg: angleRad * (180 / Math.PI) };
}

// Euler XYZ (roll, pitch, yaw) in degrees from a quaternion [x,y,z,w].
export function toEulerXYZDeg(q: Quat): { xDeg: number; yDeg: number; zDeg: number } {
  const [x, y, z, w] = normalize(q);
  const t0 = 2 * (w * x + y * z);
  const t1 = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(t0, t1);

  const t2 = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, t2)));

  const t3 = 2 * (w * z + x * y);
  const t4 = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(t3, t4);

  const radToDeg = 180 / Math.PI;
  return { xDeg: roll * radToDeg, yDeg: pitch * radToDeg, zDeg: yaw * radToDeg };
}

export function identity(): Quat {
  return [0,0,0,1];
}
