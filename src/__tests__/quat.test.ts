import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  normalize,
  identity,
  multiply,
  inverse,
  toAxisAngle,
  fromAxisAngle,
  clampQuatAngle,
  deltaQuat
} from "../core/math/quat.js";
import type { Quat, Vec3 } from "../types.js";

const EPS = 1e-6;

function close(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ~ ${b}`);
}

function closeQuat(a: Quat, b: Quat, eps = EPS) {
  // Quaternions q and -q represent the same rotation
  const sign = Math.sign(a[3]) === Math.sign(b[3]) ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    close(a[i], sign * b[i], eps);
  }
}

describe("quaternion operations", () => {
  describe("identity", () => {
    it("returns [0, 0, 0, 1]", () => {
      const q = identity();
      assert.deepEqual(q, [0, 0, 0, 1]);
    });
  });

  describe("normalize", () => {
    it("normalizes a quaternion", () => {
      const q: Quat = [1, 2, 3, 4];
      const n = normalize(q);
      const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2 + n[3] ** 2);
      close(len, 1);
    });

    it("handles zero quaternion", () => {
      const q: Quat = [0, 0, 0, 0];
      const n = normalize(q);
      assert.deepEqual(n, [0, 0, 0, 1]);
    });
  });

  describe("inverse", () => {
    it("returns conjugate for unit quaternion", () => {
      const q: Quat = normalize([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
      const inv = inverse(q);
      const product = multiply(q, inv);
      closeQuat(product, identity());
    });
  });

  describe("fromAxisAngle", () => {
    it("creates identity for 0 degrees", () => {
      const q = fromAxisAngle([1, 0, 0], 0);
      closeQuat(q, identity());
    });

    it("creates 90 degree rotation about Z", () => {
      const q = fromAxisAngle([0, 0, 1], 90);
      const { axis, angleDeg } = toAxisAngle(q);
      close(angleDeg, 90);
      close(Math.abs(axis[2]), 1); // Z-axis dominant
    });

    it("creates 180 degree rotation", () => {
      const q = fromAxisAngle([1, 0, 0], 180);
      const { angleDeg } = toAxisAngle(q);
      close(angleDeg, 180);
    });

    it("round-trips through toAxisAngle", () => {
      const originalAxis: Vec3 = [1, 0, 0];
      const originalAngle = 45;
      const q = fromAxisAngle(originalAxis, originalAngle);
      const { axis, angleDeg } = toAxisAngle(q);
      close(angleDeg, originalAngle);
      close(Math.abs(axis[0]), 1);
    });
  });

  describe("clampQuatAngle", () => {
    it("does not clamp if angle is below limit", () => {
      const q = fromAxisAngle([0, 0, 1], 30);
      const result = clampQuatAngle(q, 45);
      assert.equal(result.changed, false);
      closeQuat(result.clamped, q);
    });

    it("clamps rotation to max angle", () => {
      const q = fromAxisAngle([0, 0, 1], 60);
      const result = clampQuatAngle(q, 30);
      assert.equal(result.changed, true);
      close(result.originalDeg, 60);
      const { angleDeg } = toAxisAngle(result.clamped);
      close(angleDeg, 30);
    });

    it("preserves axis direction when clamping", () => {
      const q = fromAxisAngle([0, 1, 0], 90);
      const result = clampQuatAngle(q, 45);
      assert.equal(result.changed, true);
      const { axis, angleDeg } = toAxisAngle(result.clamped);
      close(angleDeg, 45);
      close(Math.abs(axis[1]), 1); // Y-axis preserved
    });

    it("handles identity quaternion", () => {
      const result = clampQuatAngle(identity(), 45);
      assert.equal(result.changed, false);
      closeQuat(result.clamped, identity());
    });
  });

  describe("deltaQuat", () => {
    it("returns identity for same quaternions", () => {
      const q: Quat = normalize([0.1, 0.2, 0.3, 0.9]);
      const delta = deltaQuat(q, q);
      const { angleDeg } = toAxisAngle(delta);
      close(angleDeg, 0, 0.01);
    });

    it("computes correct delta for known rotation", () => {
      const nominal = fromAxisAngle([0, 0, 1], 90);
      const asBuilt = fromAxisAngle([0, 0, 1], 45);
      const delta = deltaQuat(nominal, asBuilt);
      const { angleDeg } = toAxisAngle(delta);
      close(angleDeg, 45);
    });
  });
});

describe("rotation clamping integration", () => {
  it("clamps large rotation correctly for generateDirectives", () => {
    // Simulate what generateDirectives does:
    // Given a 60 degree error but max 30 degrees allowed
    const qErr = fromAxisAngle([0, 0, 1], 60);
    const maxDeg = 30;
    const clampResult = clampQuatAngle(qErr, maxDeg);

    assert.equal(clampResult.changed, true);
    close(clampResult.originalDeg, 60);

    const { angleDeg: clampedAngle } = toAxisAngle(clampResult.clamped);
    close(clampedAngle, 30);

    // Residual should be original - max
    const residualDeg = clampResult.originalDeg - maxDeg;
    close(residualDeg, 30);
  });
});
