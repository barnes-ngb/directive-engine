import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Vec3, Quat, Transform } from "../types.js";
import {
  fitPartToPointCloud,
  computeDOFMovement,
  formatDOFMovement,
  checkDOFTolerance,
  decomposeDOFMovement,
  getWorldReferencePoints,
} from "../core/fit/index.js";
import type {
  FabPartLineGeometry,
  FabPartPointSetGeometry,
  FabPartPlaneGeometry,
  PointCloud,
  DOFMovement,
} from "../core/fit/types.js";
import { applyTransformToPoint, invertTransform } from "../core/align/apply.js";
import { fromAxisAngle } from "../core/math/quat.js";

const EPS = 1e-4;

function close(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `Expected ${a} ~ ${b} (diff: ${Math.abs(a - b)})`);
}

function closeVec(a: Vec3, b: Vec3, eps = EPS) {
  close(a[0], b[0], eps);
  close(a[1], b[1], eps);
  close(a[2], b[2], eps);
}

// ============================================================================
// DOF Movement Tests
// ============================================================================

describe("computeDOFMovement", () => {
  it("returns zero movement for identical poses", () => {
    const T: Transform = {
      translation_mm: [100, 200, 300],
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const dof = computeDOFMovement(T, T);

    close(dof.translation.x_mm, 0);
    close(dof.translation.y_mm, 0);
    close(dof.translation.z_mm, 0);
    close(dof.translation.magnitude_mm, 0);
    close(dof.rotation.magnitude_deg, 0);
  });

  it("computes pure translation movement", () => {
    const T_nominal: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: [0, 0, 0, 1],
    };
    const T_fitted: Transform = {
      translation_mm: [10, -5, 3],
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const dof = computeDOFMovement(T_nominal, T_fitted);

    close(dof.translation.x_mm, 10);
    close(dof.translation.y_mm, -5);
    close(dof.translation.z_mm, 3);
    close(dof.translation.magnitude_mm, Math.sqrt(10 ** 2 + 5 ** 2 + 3 ** 2));
    close(dof.rotation.magnitude_deg, 0);
  });

  it("computes pure rotation movement (90 deg Z)", () => {
    const T_nominal: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: [0, 0, 0, 1],
    };
    const T_fitted: Transform = {
      translation_mm: [0, 0, 0],
      rotation_quat_xyzw: fromAxisAngle([0, 0, 1], 90),
    };

    const dof = computeDOFMovement(T_nominal, T_fitted);

    close(dof.translation.magnitude_mm, 0);
    close(dof.rotation.magnitude_deg, 90, 0.1);
    close(dof.rotation.rz_deg, 90, 0.1);
  });

  it("computes combined translation and rotation", () => {
    const T_nominal: Transform = {
      translation_mm: [100, 100, 100],
      rotation_quat_xyzw: [0, 0, 0, 1],
    };
    const T_fitted: Transform = {
      translation_mm: [105, 98, 102],
      rotation_quat_xyzw: fromAxisAngle([1, 0, 0], 5), // 5 deg roll
    };

    const dof = computeDOFMovement(T_nominal, T_fitted);

    close(dof.translation.x_mm, 5);
    close(dof.translation.y_mm, -2);
    close(dof.translation.z_mm, 2);
    close(dof.rotation.rx_deg, 5, 0.1);
    close(dof.rotation.magnitude_deg, 5, 0.1);
  });
});

describe("formatDOFMovement", () => {
  it("formats DOF movement as readable string", () => {
    const dof: DOFMovement = {
      translation: { x_mm: 10.5, y_mm: -3.2, z_mm: 1.1, magnitude_mm: 11.05 },
      rotation: { rx_deg: 2.5, ry_deg: -1.0, rz_deg: 0.5, magnitude_deg: 2.76 },
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const formatted = formatDOFMovement(dof);

    assert.ok(formatted.includes("Translation:"));
    assert.ok(formatted.includes("X: 10.500 mm"));
    assert.ok(formatted.includes("Y: -3.200 mm"));
    assert.ok(formatted.includes("Z: 1.100 mm"));
    assert.ok(formatted.includes("Rotation:"));
    assert.ok(formatted.includes("Rx (Roll):  2.500°"));
  });
});

describe("checkDOFTolerance", () => {
  it("returns within_tolerance for movement within limits", () => {
    const dof: DOFMovement = {
      translation: { x_mm: 2, y_mm: 1, z_mm: 0.5, magnitude_mm: 2.3 },
      rotation: { rx_deg: 0.5, ry_deg: 0.2, rz_deg: 0.1, magnitude_deg: 0.55 },
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const result = checkDOFTolerance(dof, {
      translation_magnitude_mm: 5,
      rotation_magnitude_deg: 1,
    });

    assert.equal(result.within_tolerance, true);
    assert.equal(result.violations.length, 0);
  });

  it("returns violations for movement exceeding limits", () => {
    const dof: DOFMovement = {
      translation: { x_mm: 10, y_mm: 1, z_mm: 0.5, magnitude_mm: 10.1 },
      rotation: { rx_deg: 5, ry_deg: 0.2, rz_deg: 0.1, magnitude_deg: 5.01 },
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const result = checkDOFTolerance(dof, {
      translation_mm: { x: 5 },
      rotation_deg: { rx: 2 },
    });

    assert.equal(result.within_tolerance, false);
    assert.equal(result.violations.length, 2);
    assert.ok(result.violations.some((v) => v.includes("Translation X")));
    assert.ok(result.violations.some((v) => v.includes("Rotation Rx")));
  });
});

describe("decomposeDOFMovement", () => {
  it("separates constrained and unconstrained movement", () => {
    const dof: DOFMovement = {
      translation: { x_mm: 5, y_mm: 3, z_mm: 2, magnitude_mm: 6.16 },
      rotation: { rx_deg: 2, ry_deg: 1, rz_deg: 3, magnitude_deg: 3.74 },
      rotation_quat_xyzw: [0, 0, 0, 1],
    };

    const result = decomposeDOFMovement(dof, {
      allowed_translation_axes: { x: true, y: false, z: false },
      allowed_rotation_axes: { rx: false, ry: false, rz: true },
    });

    // Constrained: only X translation and Rz rotation allowed
    close(result.constrained.translation.x_mm, 5);
    close(result.constrained.translation.y_mm, 0);
    close(result.constrained.translation.z_mm, 0);
    close(result.constrained.rotation.rz_deg, 3);
    close(result.constrained.rotation.rx_deg, 0);

    // Unconstrained: Y, Z translation and Rx, Ry rotation
    close(result.unconstrained.translation.x_mm, 0);
    close(result.unconstrained.translation.y_mm, 3);
    close(result.unconstrained.translation.z_mm, 2);
    close(result.unconstrained.rotation.rx_deg, 2);
    close(result.unconstrained.rotation.ry_deg, 1);
    close(result.unconstrained.rotation.rz_deg, 0);
  });
});

// ============================================================================
// Geometry Reference Points Tests
// ============================================================================

describe("getWorldReferencePoints", () => {
  it("transforms point set geometry to world frame", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-001",
      reference_points: [
        { point_id: "P1", point_mm: [0, 0, 0] },
        { point_id: "P2", point_mm: [100, 0, 0] },
        { point_id: "P3", point_mm: [0, 100, 0] },
      ],
      T_world_part_nominal: {
        translation_mm: [1000, 500, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    const worldPts = getWorldReferencePoints(geometry);

    assert.equal(worldPts.length, 3);
    closeVec(worldPts[0].point_mm, [1000, 500, 0]);
    closeVec(worldPts[1].point_mm, [1100, 500, 0]);
    closeVec(worldPts[2].point_mm, [1000, 600, 0]);
  });

  it("samples line geometry", () => {
    const geometry: FabPartLineGeometry = {
      geometry_type: "line",
      part_id: "MULLION-001",
      start_mm: [0, 0, 0],
      end_mm: [0, 0, 3000],
      T_world_part_nominal: {
        translation_mm: [500, 200, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    const worldPts = getWorldReferencePoints(geometry);

    assert.ok(worldPts.length >= 2, "Should have multiple sample points");
    // First point should be at start
    closeVec(worldPts[0].point_mm, [500, 200, 0]);
    // Last point should be at end
    closeVec(worldPts[worldPts.length - 1].point_mm, [500, 200, 3000]);
  });

  it("samples plane geometry", () => {
    const geometry: FabPartPlaneGeometry = {
      geometry_type: "plane",
      part_id: "PANEL-001",
      origin_mm: [0, 0, 0],
      normal: [0, 0, 1],
      extents_mm: { width: 1000, height: 2000 },
      T_world_part_nominal: {
        translation_mm: [0, 0, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    const worldPts = getWorldReferencePoints(geometry);

    assert.ok(worldPts.length >= 4, "Should have multiple sample points");
    // All Z coordinates should be 0 (plane at z=0)
    for (const pt of worldPts) {
      close(pt.point_mm[2], 0, 1);
    }
  });
});

// ============================================================================
// ICP Fitting Tests
// ============================================================================

describe("fitPartToPointCloud", () => {
  it("fits point cloud to identical geometry with zero deviation", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-001",
      reference_points: [
        { point_id: "P1", point_mm: [0, 0, 0] },
        { point_id: "P2", point_mm: [100, 0, 0] },
        { point_id: "P3", point_mm: [0, 100, 0] },
        { point_id: "P4", point_mm: [0, 0, 100] },
      ],
      T_world_part_nominal: {
        translation_mm: [0, 0, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    // Point cloud exactly matches reference
    const pointCloud: PointCloud = {
      points: [
        { point_mm: [0, 0, 0] },
        { point_mm: [100, 0, 0] },
        { point_mm: [0, 100, 0] },
        { point_mm: [0, 0, 100] },
      ],
    };

    const result = fitPartToPointCloud(geometry, pointCloud);

    close(result.fit_rms_mm, 0, 0.1);
    close(result.dof_movement.translation.magnitude_mm, 0, 0.1);
    close(result.dof_movement.rotation.magnitude_deg, 0, 0.1);
    assert.equal(result.converged, true);
  });

  it("recovers known translation offset", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-002",
      reference_points: [
        { point_id: "P1", point_mm: [0, 0, 0] },
        { point_id: "P2", point_mm: [100, 0, 0] },
        { point_id: "P3", point_mm: [0, 100, 0] },
        { point_id: "P4", point_mm: [0, 0, 100] },
      ],
      T_world_part_nominal: {
        translation_mm: [1000, 500, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    // Point cloud is offset by [10, -5, 3] from where it should be
    const offset: Vec3 = [10, -5, 3];
    const pointCloud: PointCloud = {
      points: [
        { point_mm: [1000 + offset[0], 500 + offset[1], 0 + offset[2]] },
        { point_mm: [1100 + offset[0], 500 + offset[1], 0 + offset[2]] },
        { point_mm: [1000 + offset[0], 600 + offset[1], 0 + offset[2]] },
        { point_mm: [1000 + offset[0], 500 + offset[1], 100 + offset[2]] },
      ],
    };

    const result = fitPartToPointCloud(geometry, pointCloud);

    // The fit should find the offset
    close(result.fit_rms_mm, 0, 1);
    // DOF movement should show the offset (negative because we're showing nominal -> fitted)
    close(Math.abs(result.dof_movement.translation.x_mm), 10, 1);
    close(Math.abs(result.dof_movement.translation.y_mm), 5, 1);
    close(Math.abs(result.dof_movement.translation.z_mm), 3, 1);
  });

  it("fits line geometry to point cloud", () => {
    const geometry: FabPartLineGeometry = {
      geometry_type: "line",
      part_id: "MULLION-001",
      start_mm: [0, 0, 0],
      end_mm: [0, 0, 1000],
      T_world_part_nominal: {
        translation_mm: [500, 200, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    // Point cloud along the line - matches line sample positions
    // Line is sampled at 10 points: 0, 111, 222, 333, 444, 556, 667, 778, 889, 1000
    const pointCloud: PointCloud = {
      points: [
        { point_mm: [500.5, 199.8, 0] },
        { point_mm: [499.8, 200.2, 111] },
        { point_mm: [500.1, 200.0, 222] },
        { point_mm: [500.0, 200.0, 333] },
        { point_mm: [500.2, 199.9, 500] },
        { point_mm: [499.9, 200.1, 667] },
        { point_mm: [500.1, 200.0, 889] },
        { point_mm: [500.0, 200.0, 1000] },
      ],
    };

    const result = fitPartToPointCloud(geometry, pointCloud);

    // Should converge and produce reasonable fit
    assert.ok(result.fit_rms_mm < 50, `RMS ${result.fit_rms_mm} should be < 50mm`);
    assert.equal(result.part_id, "MULLION-001");
    assert.ok(result.iterations > 0);
    // DOF movement should be small since point cloud is close to nominal
    assert.ok(
      result.dof_movement.translation.magnitude_mm < 10,
      `Translation ${result.dof_movement.translation.magnitude_mm} should be < 10mm`
    );
  });

  it("reports deviation statistics", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-003",
      reference_points: [
        { point_id: "P1", point_mm: [0, 0, 0] },
        { point_id: "P2", point_mm: [100, 0, 0] },
        { point_id: "P3", point_mm: [0, 100, 0] },
      ],
      T_world_part_nominal: {
        translation_mm: [0, 0, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    // Point cloud with known deviations
    const pointCloud: PointCloud = {
      points: [
        { point_mm: [1, 0, 0] }, // 1mm off
        { point_mm: [100, 2, 0] }, // 2mm off
        { point_mm: [0, 100, 3] }, // 3mm off
      ],
    };

    const result = fitPartToPointCloud(geometry, pointCloud, {
      include_point_deviations: true,
    });

    assert.ok(result.deviation_stats.rms_mm > 0);
    assert.ok(result.deviation_stats.max_mm > 0);
    assert.ok(result.deviation_stats.point_count === 3);
    assert.ok(result.point_deviations);
    assert.equal(result.point_deviations.length, 3);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  it("throws on empty point cloud", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-004",
      reference_points: [{ point_id: "P1", point_mm: [0, 0, 0] }],
      T_world_part_nominal: {
        translation_mm: [0, 0, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    const emptyCloud: PointCloud = { points: [] };

    assert.throws(() => fitPartToPointCloud(geometry, emptyCloud), /empty/i);
  });

  it("handles sparse point cloud", () => {
    const geometry: FabPartPointSetGeometry = {
      geometry_type: "point_set",
      part_id: "TEST-005",
      reference_points: [
        { point_id: "P1", point_mm: [0, 0, 0] },
        { point_id: "P2", point_mm: [100, 0, 0] },
        { point_id: "P3", point_mm: [0, 100, 0] },
        { point_id: "P4", point_mm: [0, 0, 100] },
      ],
      T_world_part_nominal: {
        translation_mm: [0, 0, 0],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    };

    // Only 3 points
    const sparseCloud: PointCloud = {
      points: [
        { point_mm: [0, 0, 0] },
        { point_mm: [100, 0, 0] },
        { point_mm: [0, 100, 0] },
      ],
    };

    const result = fitPartToPointCloud(geometry, sparseCloud);

    // Should still produce a result
    assert.ok(result.part_id === "TEST-005");
    assert.ok(Number.isFinite(result.fit_rms_mm));
  });
});
