/**
 * Runtime validation for directive engine inputs.
 * Provides lightweight validation without external dependencies.
 */

import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset,
  Quat,
  Vec3
} from "./types.js";
import { ValidationError } from "./errors.js";
import { EPS_QUAT_NORM } from "./constants.js";

export { ValidationError };

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function isQuat(value: unknown): value is Quat {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function isQuatNormalized(q: Quat, tolerance = EPS_QUAT_NORM): boolean {
  const norm = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  return Math.abs(norm - 1) <= tolerance;
}

function isValidConfidence(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isISODateString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const date = Date.parse(value);
  return !Number.isNaN(date);
}

/**
 * Validate a NominalPosesDataset.
 */
export function validateNominalPoses(data: unknown): NominalPosesDataset {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    throw new ValidationError(["Input must be an object"]);
  }

  const obj = data as Record<string, unknown>;

  // Check schema version
  if (obj.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${obj.schema_version}"`);
  }

  // Check required fields
  if (typeof obj.dataset_id !== "string" || obj.dataset_id.length === 0) {
    errors.push("dataset_id must be a non-empty string");
  }

  if (obj.frame_id !== "world") {
    errors.push(`Expected frame_id "world", got "${obj.frame_id}"`);
  }

  // Check parts array
  if (!Array.isArray(obj.parts)) {
    errors.push("parts must be an array");
  } else {
    const seenIds = new Set<string>();

    for (let i = 0; i < obj.parts.length; i++) {
      const part = obj.parts[i] as Record<string, unknown>;
      const prefix = `parts[${i}]`;

      if (typeof part.part_id !== "string" || part.part_id.length === 0) {
        errors.push(`${prefix}.part_id must be a non-empty string`);
      } else if (seenIds.has(part.part_id)) {
        errors.push(`${prefix}.part_id "${part.part_id}" is duplicated`);
      } else {
        seenIds.add(part.part_id);
      }

      const transform = part.T_world_part_nominal as Record<string, unknown>;
      if (!transform || typeof transform !== "object") {
        errors.push(`${prefix}.T_world_part_nominal must be an object`);
      } else {
        if (!isVec3(transform.translation_mm)) {
          errors.push(`${prefix}.T_world_part_nominal.translation_mm must be a Vec3`);
        }
        if (!isQuat(transform.rotation_quat_xyzw)) {
          errors.push(`${prefix}.T_world_part_nominal.rotation_quat_xyzw must be a Quat`);
        } else if (!isQuatNormalized(transform.rotation_quat_xyzw as Quat)) {
          errors.push(`${prefix}.T_world_part_nominal.rotation_quat_xyzw is not normalized`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return data as NominalPosesDataset;
}

/**
 * Validate an AsBuiltPosesDataset.
 */
export function validateAsBuiltPoses(data: unknown): AsBuiltPosesDataset {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    throw new ValidationError(["Input must be an object"]);
  }

  const obj = data as Record<string, unknown>;

  // Check schema version
  if (obj.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${obj.schema_version}"`);
  }

  // Check required fields
  if (typeof obj.dataset_id !== "string" || obj.dataset_id.length === 0) {
    errors.push("dataset_id must be a non-empty string");
  }

  if (obj.frame_id !== "world") {
    errors.push(`Expected frame_id "world", got "${obj.frame_id}"`);
  }

  if (!isISODateString(obj.measured_at)) {
    errors.push("measured_at must be a valid ISO date string");
  }

  // Check parts array
  if (!Array.isArray(obj.parts)) {
    errors.push("parts must be an array");
  } else {
    const seenIds = new Set<string>();

    for (let i = 0; i < obj.parts.length; i++) {
      const part = obj.parts[i] as Record<string, unknown>;
      const prefix = `parts[${i}]`;

      if (typeof part.part_id !== "string" || part.part_id.length === 0) {
        errors.push(`${prefix}.part_id must be a non-empty string`);
      } else if (seenIds.has(part.part_id)) {
        errors.push(`${prefix}.part_id "${part.part_id}" is duplicated`);
      } else {
        seenIds.add(part.part_id);
      }

      if (!isValidConfidence(part.pose_confidence)) {
        errors.push(`${prefix}.pose_confidence must be a number between 0 and 1`);
      }

      const transform = part.T_world_part_asBuilt as Record<string, unknown>;
      if (!transform || typeof transform !== "object") {
        errors.push(`${prefix}.T_world_part_asBuilt must be an object`);
      } else {
        if (!isVec3(transform.translation_mm)) {
          errors.push(`${prefix}.T_world_part_asBuilt.translation_mm must be a Vec3`);
        }
        if (!isQuat(transform.rotation_quat_xyzw)) {
          errors.push(`${prefix}.T_world_part_asBuilt.rotation_quat_xyzw must be a Quat`);
        } else if (!isQuatNormalized(transform.rotation_quat_xyzw as Quat)) {
          errors.push(`${prefix}.T_world_part_asBuilt.rotation_quat_xyzw is not normalized`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return data as AsBuiltPosesDataset;
}

/**
 * Validate a ConstraintsDataset.
 */
export function validateConstraints(data: unknown): ConstraintsDataset {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    throw new ValidationError(["Input must be an object"]);
  }

  const obj = data as Record<string, unknown>;

  // Check schema version
  if (obj.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${obj.schema_version}"`);
  }

  // Check required fields
  if (typeof obj.dataset_id !== "string" || obj.dataset_id.length === 0) {
    errors.push("dataset_id must be a non-empty string");
  }

  // Check engine_config
  const config = obj.engine_config as Record<string, unknown>;
  if (!config || typeof config !== "object") {
    errors.push("engine_config must be an object");
  } else {
    if (!isValidConfidence(config.confidence_threshold)) {
      errors.push("engine_config.confidence_threshold must be a number between 0 and 1");
    }
  }

  // Check parts array
  if (!Array.isArray(obj.parts)) {
    errors.push("parts must be an array");
  } else {
    const seenIds = new Set<string>();
    const validRotationModes = ["fixed", "free", "index"];

    for (let i = 0; i < obj.parts.length; i++) {
      const part = obj.parts[i] as Record<string, unknown>;
      const prefix = `parts[${i}]`;

      if (typeof part.part_id !== "string" || part.part_id.length === 0) {
        errors.push(`${prefix}.part_id must be a non-empty string`);
      } else if (seenIds.has(part.part_id)) {
        errors.push(`${prefix}.part_id "${part.part_id}" is duplicated`);
      } else {
        seenIds.add(part.part_id);
      }

      // Check rotation_mode
      if (!validRotationModes.includes(part.rotation_mode as string)) {
        errors.push(`${prefix}.rotation_mode must be one of: ${validRotationModes.join(", ")}`);
      }

      // Check allowed_translation_axes
      const transAxes = part.allowed_translation_axes as Record<string, unknown>;
      if (!transAxes || typeof transAxes !== "object") {
        errors.push(`${prefix}.allowed_translation_axes must be an object`);
      } else {
        for (const axis of ["x", "y", "z"]) {
          if (typeof transAxes[axis] !== "boolean") {
            errors.push(`${prefix}.allowed_translation_axes.${axis} must be a boolean`);
          }
        }
      }

      // Check allowed_rotation_axes
      const rotAxes = part.allowed_rotation_axes as Record<string, unknown>;
      if (!rotAxes || typeof rotAxes !== "object") {
        errors.push(`${prefix}.allowed_rotation_axes must be an object`);
      } else {
        for (const axis of ["x", "y", "z"]) {
          if (typeof rotAxes[axis] !== "boolean") {
            errors.push(`${prefix}.allowed_rotation_axes.${axis} must be a boolean`);
          }
        }
      }

      // Check tolerances
      const tol = part.tolerances as Record<string, unknown>;
      if (!tol || typeof tol !== "object") {
        errors.push(`${prefix}.tolerances must be an object`);
      } else {
        if (typeof tol.translation_mm !== "number" || tol.translation_mm < 0) {
          errors.push(`${prefix}.tolerances.translation_mm must be a non-negative number`);
        }
        if (typeof tol.rotation_deg !== "number" || tol.rotation_deg < 0) {
          errors.push(`${prefix}.tolerances.rotation_deg must be a non-negative number`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return data as ConstraintsDataset;
}

/**
 * Validate all inputs for generateDirectives.
 */
export function validateInputs(
  nominal: unknown,
  asBuilt: unknown,
  constraints: unknown
): {
  nominal: NominalPosesDataset;
  asBuilt: AsBuiltPosesDataset;
  constraints: ConstraintsDataset;
} {
  const validatedNominal = validateNominalPoses(nominal);
  const validatedAsBuilt = validateAsBuiltPoses(asBuilt);
  const validatedConstraints = validateConstraints(constraints);

  // Cross-validate dataset IDs match
  const errors: string[] = [];
  if (validatedNominal.dataset_id !== validatedAsBuilt.dataset_id) {
    errors.push(
      `nominal.dataset_id "${validatedNominal.dataset_id}" does not match asBuilt.dataset_id "${validatedAsBuilt.dataset_id}"`
    );
  }
  if (validatedNominal.dataset_id !== validatedConstraints.dataset_id) {
    errors.push(
      `nominal.dataset_id "${validatedNominal.dataset_id}" does not match constraints.dataset_id "${validatedConstraints.dataset_id}"`
    );
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return {
    nominal: validatedNominal,
    asBuilt: validatedAsBuilt,
    constraints: validatedConstraints
  };
}
