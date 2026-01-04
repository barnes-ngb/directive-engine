/**
 * DOF (Degrees of Freedom) movement analysis.
 *
 * Computes the breakdown of how a part has moved from its nominal position
 * in terms of translation (X, Y, Z) and rotation (Rx, Ry, Rz).
 */
import type { Quat, Transform, Vec3 } from "../types.js";
import type { DOFMovement, TranslationDOF, RotationDOF } from "./types.js";
import { norm, sub } from "../math/vec.js";
import { deltaQuat, toAxisAngle, toEulerXYZDeg, normalize, multiply, inverse } from "../math/quat.js";

/**
 * Compute the DOF movement between a nominal and fitted pose.
 *
 * The movement represents how the fitted pose differs from the nominal pose,
 * expressed as translation deltas (X, Y, Z in mm) and rotation deltas
 * (Rx, Ry, Rz in degrees using Euler XYZ convention).
 *
 * @param T_nominal - The nominal (expected) pose in world frame
 * @param T_fitted - The fitted (actual) pose in world frame
 * @returns DOF movement breakdown
 */
export function computeDOFMovement(T_nominal: Transform, T_fitted: Transform): DOFMovement {
  // Translation movement: fitted - nominal
  const translationVec = sub(T_fitted.translation_mm, T_nominal.translation_mm);
  const translation = computeTranslationDOF(translationVec);

  // Rotation movement: delta quaternion from nominal to fitted
  // q_delta = q_fitted * q_nominal^-1
  const q_delta = deltaQuat(T_fitted.rotation_quat_xyzw, T_nominal.rotation_quat_xyzw);
  const rotation = computeRotationDOF(q_delta);

  return {
    translation,
    rotation,
    rotation_quat_xyzw: q_delta,
  };
}

/**
 * Compute translation DOF from a translation vector.
 */
export function computeTranslationDOF(translationVec: Vec3): TranslationDOF {
  return {
    x_mm: translationVec[0],
    y_mm: translationVec[1],
    z_mm: translationVec[2],
    magnitude_mm: norm(translationVec),
  };
}

/**
 * Compute rotation DOF from a delta quaternion.
 *
 * Returns both Euler angles (for per-axis analysis) and
 * total rotation magnitude (axis-angle representation).
 */
export function computeRotationDOF(q_delta: Quat): RotationDOF {
  // Get Euler angles (XYZ order)
  const euler = toEulerXYZDeg(q_delta);

  // Get total rotation magnitude from axis-angle
  const { angleDeg } = toAxisAngle(q_delta);

  return {
    rx_deg: euler.xDeg,
    ry_deg: euler.yDeg,
    rz_deg: euler.zDeg,
    magnitude_deg: angleDeg,
  };
}

/**
 * Format DOF movement as a human-readable string.
 */
export function formatDOFMovement(dof: DOFMovement): string {
  const t = dof.translation;
  const r = dof.rotation;

  const lines = [
    "DOF Movement Analysis:",
    "",
    "Translation:",
    `  X: ${t.x_mm.toFixed(3)} mm`,
    `  Y: ${t.y_mm.toFixed(3)} mm`,
    `  Z: ${t.z_mm.toFixed(3)} mm`,
    `  Magnitude: ${t.magnitude_mm.toFixed(3)} mm`,
    "",
    "Rotation:",
    `  Rx (Roll):  ${r.rx_deg.toFixed(3)}°`,
    `  Ry (Pitch): ${r.ry_deg.toFixed(3)}°`,
    `  Rz (Yaw):   ${r.rz_deg.toFixed(3)}°`,
    `  Magnitude:  ${r.magnitude_deg.toFixed(3)}°`,
  ];

  return lines.join("\n");
}

/**
 * Check if DOF movement is within specified tolerances.
 */
export interface DOFTolerances {
  /** Maximum allowed translation per axis (mm) */
  translation_mm?: { x?: number; y?: number; z?: number };
  /** Maximum allowed translation magnitude (mm) */
  translation_magnitude_mm?: number;
  /** Maximum allowed rotation per axis (degrees) */
  rotation_deg?: { rx?: number; ry?: number; rz?: number };
  /** Maximum allowed rotation magnitude (degrees) */
  rotation_magnitude_deg?: number;
}

export interface DOFToleranceResult {
  within_tolerance: boolean;
  violations: string[];
}

/**
 * Check if DOF movement is within specified tolerances.
 */
export function checkDOFTolerance(
  dof: DOFMovement,
  tolerances: DOFTolerances
): DOFToleranceResult {
  const violations: string[] = [];

  // Check translation per-axis
  if (tolerances.translation_mm) {
    if (tolerances.translation_mm.x !== undefined &&
        Math.abs(dof.translation.x_mm) > tolerances.translation_mm.x) {
      violations.push(
        `Translation X: ${Math.abs(dof.translation.x_mm).toFixed(3)} mm exceeds limit of ${tolerances.translation_mm.x} mm`
      );
    }
    if (tolerances.translation_mm.y !== undefined &&
        Math.abs(dof.translation.y_mm) > tolerances.translation_mm.y) {
      violations.push(
        `Translation Y: ${Math.abs(dof.translation.y_mm).toFixed(3)} mm exceeds limit of ${tolerances.translation_mm.y} mm`
      );
    }
    if (tolerances.translation_mm.z !== undefined &&
        Math.abs(dof.translation.z_mm) > tolerances.translation_mm.z) {
      violations.push(
        `Translation Z: ${Math.abs(dof.translation.z_mm).toFixed(3)} mm exceeds limit of ${tolerances.translation_mm.z} mm`
      );
    }
  }

  // Check translation magnitude
  if (tolerances.translation_magnitude_mm !== undefined &&
      dof.translation.magnitude_mm > tolerances.translation_magnitude_mm) {
    violations.push(
      `Translation magnitude: ${dof.translation.magnitude_mm.toFixed(3)} mm exceeds limit of ${tolerances.translation_magnitude_mm} mm`
    );
  }

  // Check rotation per-axis
  if (tolerances.rotation_deg) {
    if (tolerances.rotation_deg.rx !== undefined &&
        Math.abs(dof.rotation.rx_deg) > tolerances.rotation_deg.rx) {
      violations.push(
        `Rotation Rx: ${Math.abs(dof.rotation.rx_deg).toFixed(3)}° exceeds limit of ${tolerances.rotation_deg.rx}°`
      );
    }
    if (tolerances.rotation_deg.ry !== undefined &&
        Math.abs(dof.rotation.ry_deg) > tolerances.rotation_deg.ry) {
      violations.push(
        `Rotation Ry: ${Math.abs(dof.rotation.ry_deg).toFixed(3)}° exceeds limit of ${tolerances.rotation_deg.ry}°`
      );
    }
    if (tolerances.rotation_deg.rz !== undefined &&
        Math.abs(dof.rotation.rz_deg) > tolerances.rotation_deg.rz) {
      violations.push(
        `Rotation Rz: ${Math.abs(dof.rotation.rz_deg).toFixed(3)}° exceeds limit of ${tolerances.rotation_deg.rz}°`
      );
    }
  }

  // Check rotation magnitude
  if (tolerances.rotation_magnitude_deg !== undefined &&
      dof.rotation.magnitude_deg > tolerances.rotation_magnitude_deg) {
    violations.push(
      `Rotation magnitude: ${dof.rotation.magnitude_deg.toFixed(3)}° exceeds limit of ${tolerances.rotation_magnitude_deg}°`
    );
  }

  return {
    within_tolerance: violations.length === 0,
    violations,
  };
}

/**
 * Decompose a 6-DOF movement into constrained and unconstrained components.
 *
 * Useful when a part has limited degrees of freedom (e.g., can only slide
 * along one axis or rotate about one axis).
 */
export interface ConstrainedDOF {
  allowed_translation_axes: { x: boolean; y: boolean; z: boolean };
  allowed_rotation_axes: { rx: boolean; ry: boolean; rz: boolean };
}

export interface DecomposedDOF {
  /** Movement within allowed DOF */
  constrained: DOFMovement;
  /** Movement outside allowed DOF (represents deviation/error) */
  unconstrained: DOFMovement;
}

/**
 * Decompose DOF movement into constrained and unconstrained components.
 */
export function decomposeDOFMovement(
  dof: DOFMovement,
  constraints: ConstrainedDOF
): DecomposedDOF {
  const { allowed_translation_axes: tAxes, allowed_rotation_axes: rAxes } = constraints;

  // Split translation
  const constrainedT: Vec3 = [
    tAxes.x ? dof.translation.x_mm : 0,
    tAxes.y ? dof.translation.y_mm : 0,
    tAxes.z ? dof.translation.z_mm : 0,
  ];
  const unconstrainedT: Vec3 = [
    tAxes.x ? 0 : dof.translation.x_mm,
    tAxes.y ? 0 : dof.translation.y_mm,
    tAxes.z ? 0 : dof.translation.z_mm,
  ];

  // Split rotation (simplified - uses Euler decomposition)
  const constrainedR: RotationDOF = {
    rx_deg: rAxes.rx ? dof.rotation.rx_deg : 0,
    ry_deg: rAxes.ry ? dof.rotation.ry_deg : 0,
    rz_deg: rAxes.rz ? dof.rotation.rz_deg : 0,
    magnitude_deg: 0, // Will be recomputed
  };
  constrainedR.magnitude_deg = Math.sqrt(
    constrainedR.rx_deg ** 2 + constrainedR.ry_deg ** 2 + constrainedR.rz_deg ** 2
  );

  const unconstrainedR: RotationDOF = {
    rx_deg: rAxes.rx ? 0 : dof.rotation.rx_deg,
    ry_deg: rAxes.ry ? 0 : dof.rotation.ry_deg,
    rz_deg: rAxes.rz ? 0 : dof.rotation.rz_deg,
    magnitude_deg: 0,
  };
  unconstrainedR.magnitude_deg = Math.sqrt(
    unconstrainedR.rx_deg ** 2 + unconstrainedR.ry_deg ** 2 + unconstrainedR.rz_deg ** 2
  );

  return {
    constrained: {
      translation: computeTranslationDOF(constrainedT),
      rotation: constrainedR,
      rotation_quat_xyzw: dof.rotation_quat_xyzw, // Simplified
    },
    unconstrained: {
      translation: computeTranslationDOF(unconstrainedT),
      rotation: unconstrainedR,
      rotation_quat_xyzw: [0, 0, 0, 1], // Identity for unconstrained
    },
  };
}
