import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ValidationError,
  validateNominalPoses,
  validateAsBuiltPoses,
  validateConstraints,
  validateInputs
} from "../core/validate.js";
import type {
  AsBuiltPosesDataset,
  ConstraintsDataset,
  NominalPosesDataset
} from "../types.js";

describe("validateNominalPoses", () => {
  const validNominal: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: [
      {
        part_id: "P1",
        part_name: "Part 1",
        part_type: "panel",
        T_world_part_nominal: {
          translation_mm: [0, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1]
        }
      }
    ]
  };

  it("accepts valid nominal poses", () => {
    const result = validateNominalPoses(validNominal);
    assert.equal(result.dataset_id, "test-dataset");
  });

  it("rejects wrong schema version", () => {
    const invalid = { ...validNominal, schema_version: "v0.2" };
    assert.throws(
      () => validateNominalPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("schema_version"))
    );
  });

  it("rejects duplicate part_ids", () => {
    const invalid = {
      ...validNominal,
      parts: [validNominal.parts[0], validNominal.parts[0]]
    };
    assert.throws(
      () => validateNominalPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("duplicated"))
    );
  });

  it("rejects non-normalized quaternion", () => {
    const invalid = {
      ...validNominal,
      parts: [
        {
          ...validNominal.parts[0],
          T_world_part_nominal: {
            translation_mm: [0, 0, 0],
            rotation_quat_xyzw: [1, 1, 1, 1] // Not normalized
          }
        }
      ]
    };
    assert.throws(
      () => validateNominalPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("not normalized"))
    );
  });

  it("rejects invalid Vec3", () => {
    const invalid = {
      ...validNominal,
      parts: [
        {
          ...validNominal.parts[0],
          T_world_part_nominal: {
            translation_mm: [0, 0], // Only 2 elements
            rotation_quat_xyzw: [0, 0, 0, 1]
          }
        }
      ]
    };
    assert.throws(
      () => validateNominalPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("Vec3"))
    );
  });
});

describe("validateAsBuiltPoses", () => {
  const validAsBuilt: AsBuiltPosesDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: "2024-01-15T10:30:00Z",
    parts: [
      {
        part_id: "P1",
        T_world_part_asBuilt: {
          translation_mm: [1, 2, 3],
          rotation_quat_xyzw: [0, 0, 0, 1]
        },
        pose_confidence: 0.95
      }
    ]
  };

  it("accepts valid as-built poses", () => {
    const result = validateAsBuiltPoses(validAsBuilt);
    assert.equal(result.dataset_id, "test-dataset");
  });

  it("rejects invalid confidence (> 1)", () => {
    const invalid = {
      ...validAsBuilt,
      parts: [{ ...validAsBuilt.parts[0], pose_confidence: 1.5 }]
    };
    assert.throws(
      () => validateAsBuiltPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("pose_confidence"))
    );
  });

  it("rejects invalid confidence (< 0)", () => {
    const invalid = {
      ...validAsBuilt,
      parts: [{ ...validAsBuilt.parts[0], pose_confidence: -0.1 }]
    };
    assert.throws(
      () => validateAsBuiltPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("pose_confidence"))
    );
  });

  it("rejects invalid measured_at", () => {
    const invalid = { ...validAsBuilt, measured_at: "not-a-date" };
    assert.throws(
      () => validateAsBuiltPoses(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("measured_at"))
    );
  });
});

describe("validateConstraints", () => {
  const validConstraints: ConstraintsDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    engine_config: {
      confidence_threshold: 0.7
    },
    parts: [
      {
        part_id: "P1",
        allowed_translation_axes: { x: true, y: true, z: false },
        rotation_mode: "free",
        allowed_rotation_axes: { x: false, y: false, z: true },
        tolerances: {
          translation_mm: 2.0,
          rotation_deg: 1.0
        }
      }
    ]
  };

  it("accepts valid constraints", () => {
    const result = validateConstraints(validConstraints);
    assert.equal(result.dataset_id, "test-dataset");
  });

  it("rejects invalid rotation_mode", () => {
    const invalid = {
      ...validConstraints,
      parts: [{ ...validConstraints.parts[0], rotation_mode: "invalid" }]
    };
    assert.throws(
      () => validateConstraints(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("rotation_mode"))
    );
  });

  it("rejects invalid confidence_threshold", () => {
    const invalid = {
      ...validConstraints,
      engine_config: { confidence_threshold: 2.0 }
    };
    assert.throws(
      () => validateConstraints(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("confidence_threshold"))
    );
  });

  it("rejects negative tolerance", () => {
    const invalid = {
      ...validConstraints,
      parts: [
        {
          ...validConstraints.parts[0],
          tolerances: { translation_mm: -1, rotation_deg: 1 }
        }
      ]
    };
    assert.throws(
      () => validateConstraints(invalid),
      (err: ValidationError) => err.errors.some((e) => e.includes("non-negative"))
    );
  });
});

describe("validateInputs", () => {
  const validNominal: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: [
      {
        part_id: "P1",
        part_name: "Part 1",
        part_type: "panel",
        T_world_part_nominal: {
          translation_mm: [0, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1]
        }
      }
    ]
  };

  const validAsBuilt: AsBuiltPosesDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    measured_at: "2024-01-15T10:30:00Z",
    parts: [
      {
        part_id: "P1",
        T_world_part_asBuilt: {
          translation_mm: [1, 2, 3],
          rotation_quat_xyzw: [0, 0, 0, 1]
        },
        pose_confidence: 0.95
      }
    ]
  };

  const validConstraints: ConstraintsDataset = {
    schema_version: "v0.1",
    dataset_id: "test-dataset",
    engine_config: { confidence_threshold: 0.7 },
    parts: [
      {
        part_id: "P1",
        allowed_translation_axes: { x: true, y: true, z: false },
        rotation_mode: "free",
        allowed_rotation_axes: { x: false, y: false, z: true },
        tolerances: { translation_mm: 2.0, rotation_deg: 1.0 }
      }
    ]
  };

  it("accepts matching dataset IDs", () => {
    const result = validateInputs(validNominal, validAsBuilt, validConstraints);
    assert.equal(result.nominal.dataset_id, "test-dataset");
    assert.equal(result.asBuilt.dataset_id, "test-dataset");
    assert.equal(result.constraints.dataset_id, "test-dataset");
  });

  it("rejects mismatched dataset IDs", () => {
    const mismatchedAsBuilt = { ...validAsBuilt, dataset_id: "other-dataset" };
    assert.throws(
      () => validateInputs(validNominal, mismatchedAsBuilt, validConstraints),
      (err: ValidationError) => err.errors.some((e) => e.includes("does not match"))
    );
  });
});

describe("ValidationError", () => {
  it("collects multiple errors", () => {
    const errors = ["error 1", "error 2", "error 3"];
    const err = new ValidationError(errors);
    assert.equal(err.errors.length, 3);
    assert.ok(err.message.includes("error 1"));
    assert.ok(err.message.includes("error 2"));
    assert.equal(err.name, "ValidationError");
  });
});
