import type { Transform, Vec3 } from "../types.js";

import { add } from "../math/vec.js";
import { rotateVec3ByQuat } from "./applyTransform.js";

export interface Line3 {
  start_mm: Vec3;
  end_mm: Vec3;
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
