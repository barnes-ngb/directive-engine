import type { Quat } from "../types.js";
import { roundScalar } from "./vec.js";

export function normalize(q: Quat): Quat {
  const [x,y,z,w] = q;
  const n = Math.sqrt(x*x + y*y + z*z + w*w);
  if (n === 0) return [0,0,0,1];
  return [x/n, y/n, z/n, w/n];
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
  const qq = normalize(q);
  const w = Math.max(-1, Math.min(1, qq[3]));
  const angleRad = 2 * Math.acos(w);
  const angleDeg = angleRad * (180 / Math.PI);
  // Normalize to [0,180] (for unit quaternion, acos gives [0,pi])
  return angleDeg;
}

export function identity(): Quat {
  return [0,0,0,1];
}

export function roundQuat(q: Quat, decimals: number): Quat {
  return [
    roundScalar(q[0], decimals),
    roundScalar(q[1], decimals),
    roundScalar(q[2], decimals),
    roundScalar(q[3], decimals)
  ];
}
