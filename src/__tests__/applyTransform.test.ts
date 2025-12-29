import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyTransformToLine,
  applyTransformToPoint,
  type Line3,
  type Transform,
  type Vec3
} from "../core/index.js";

const EPS = 1e-6;

function close(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ~ ${b}`);
}

function closeVec(a: Vec3, b: Vec3, eps = EPS) {
  close(a[0], b[0], eps);
  close(a[1], b[1], eps);
  close(a[2], b[2], eps);
}

describe("applyTransform helpers", () => {
  it("applies rotation + translation to a point", () => {
    const transform: Transform = {
      translation_mm: [1, 2, 3],
      rotation_quat_xyzw: [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    };

    const point: Vec3 = [1, 0, 0];
    const transformed = applyTransformToPoint(transform, point);

    closeVec(transformed, [1, 3, 3]);
  });

  it("applies the same transform to a line", () => {
    const transform: Transform = {
      translation_mm: [1, 2, 3],
      rotation_quat_xyzw: [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    };

    const line: Line3 = {
      start_mm: [1, 0, 0],
      end_mm: [0, 1, 0]
    };

    const transformed = applyTransformToLine(transform, line);

    closeVec(transformed.start_mm, [1, 3, 3]);
    closeVec(transformed.end_mm, [0, 2, 3]);
  });
});
