import type { Transform, Vec3 } from "../types.js";

import { add } from "../math/vec.js";
import { rotateVec3ByQuat } from "./applyTransform.js";

export interface Line3 {
  point_mm: Vec3;
  direction_mm: Vec3;
}

export function applyTransformToPoint(point: Vec3, transform: Transform): Vec3 {
  return add(rotateVec3ByQuat(point, transform.rotation_quat_xyzw), transform.translation_mm);
}

export function applyTransformToLine(line: Line3, transform: Transform): Line3 {
  return {
    point_mm: applyTransformToPoint(line.point_mm, transform),
    direction_mm: rotateVec3ByQuat(line.direction_mm, transform.rotation_quat_xyzw)
  };
}
