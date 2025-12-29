import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyTransformToPoint,
  computeRigidTransform,
  type AnchorPoint,
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

function residualVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

describe("computeRigidTransform", () => {
  it("recovers a known rigid transform", () => {
    const scanPts: AnchorPoint[] = [
      { anchor_id: "A", point_mm: [1, 2, 3] },
      { anchor_id: "B", point_mm: [-4, 1, 0] },
      { anchor_id: "C", point_mm: [2, -3, 5] },
      { anchor_id: "D", point_mm: [0, 0, 0] }
    ];

    const T_model_scan = {
      translation_mm: [10, -5, 3] as Vec3,
      rotation_quat_xyzw: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number]
    };

    const modelPts = scanPts.map(({ anchor_id, point_mm }) => ({
      anchor_id,
      point_mm: applyTransformToPoint(point_mm, T_model_scan)
    }));

    const result = computeRigidTransform(scanPts, modelPts);

    for (let i = 0; i < scanPts.length; i++) {
      const predicted = applyTransformToPoint(scanPts[i].point_mm, result.T_model_scan);
      closeVec(predicted, modelPts[i].point_mm, 2e-4);
    }

    close(result.rms_mm, 0, 2e-4);
  });

  it("reports per-anchor residuals", () => {
    const scanPts: AnchorPoint[] = [
      { anchor_id: "A", point_mm: [0, 0, 0] },
      { anchor_id: "B", point_mm: [1, 0, 0] },
      { anchor_id: "C", point_mm: [0, 1, 0] }
    ];

    const modelPts: AnchorPoint[] = [
      { anchor_id: "C", point_mm: [0.1, 1.2, -0.1] },
      { anchor_id: "A", point_mm: [0.2, -0.1, 0.05] },
      { anchor_id: "B", point_mm: [1.1, 0.1, 0.0] }
    ];

    const result = computeRigidTransform(scanPts, modelPts);

    assert.equal(result.residuals_mm.length, scanPts.length);

    for (const residual of result.residuals_mm) {
      const scanPoint = scanPts.find((pt) => pt.anchor_id === residual.anchor_id);
      const modelPoint = modelPts.find((pt) => pt.anchor_id === residual.anchor_id);
      assert.ok(scanPoint && modelPoint, "Expected matching anchors");
      const predicted = applyTransformToPoint(scanPoint.point_mm, result.T_model_scan);
      const expectedVec = residualVec(modelPoint.point_mm, predicted);
      closeVec(residual.residual_vec_mm, expectedVec, 1e-6);
      close(residual.residual_mm, Math.sqrt(expectedVec[0] ** 2 + expectedVec[1] ** 2 + expectedVec[2] ** 2));
    }
  });
});
