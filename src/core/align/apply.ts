import type { Quat, Transform, Vec3 } from "../types.js";

import { inverse, multiply, normalize } from "../math/quat.js";
import { add, scale } from "../math/vec.js";

export interface Line3 {
  start_mm: Vec3;
  end_mm: Vec3;
}

export function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = normalize(q);
  const [vx, vy, vz] = v;

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

export function applyTransform(point: Vec3, transform: Transform): Vec3 {
  return applyTransformToPoint(transform, point);
}

export function applyTransformToPoint(transform: Transform, point: Vec3): Vec3 {
  return add(rotateVec3ByQuat(point, transform.rotation_quat_xyzw), transform.translation_mm);
}

export function applyTransformToLine(transform: Transform, line: Line3): Line3 {
  return {
    start_mm: applyTransformToPoint(transform, line.start_mm),
    end_mm: applyTransformToPoint(transform, line.end_mm)
  };
}

export function invertTransform(transform: Transform): Transform {
  const rotation_quat_xyzw = inverse(transform.rotation_quat_xyzw);
  const translation_mm = rotateVec3ByQuat(scale(transform.translation_mm, -1), rotation_quat_xyzw);
  return { translation_mm, rotation_quat_xyzw };
}

// Applies `first` then `second`.
export function composeTransforms(first: Transform, second: Transform): Transform {
  const rotation_quat_xyzw = multiply(second.rotation_quat_xyzw, first.rotation_quat_xyzw);
  const rotatedTranslation = rotateVec3ByQuat(first.translation_mm, second.rotation_quat_xyzw);
  const translation_mm = add(rotatedTranslation, second.translation_mm);
  return { translation_mm, rotation_quat_xyzw };
}
