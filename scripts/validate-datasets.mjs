#!/usr/bin/env node
/**
 * Dataset validation script for directive-engine.
 * Validates all dataset files against their schemas.
 *
 * Usage:
 *   node scripts/validate-datasets.mjs [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const VERBOSE = process.argv.includes("--verbose");

// Colors for terminal output
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function isVec3(value) {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function isQuat(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function isQuatNormalized(q, tolerance = 0.01) {
  const norm = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  return Math.abs(norm - 1) <= tolerance;
}

function isLine3(value) {
  return (
    value &&
    typeof value === "object" &&
    isVec3(value.p0) &&
    isVec3(value.p1)
  );
}

function isISODate(value) {
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataset validators
// ─────────────────────────────────────────────────────────────────────────────

function validateNominalPoses(data) {
  const errors = [];

  if (data.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${data.schema_version}"`);
  }
  if (typeof data.dataset_id !== "string" || !data.dataset_id) {
    errors.push("dataset_id must be a non-empty string");
  }
  if (data.frame_id !== "world") {
    errors.push(`Expected frame_id "world", got "${data.frame_id}"`);
  }
  if (!Array.isArray(data.parts) || data.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    const ids = new Set();
    data.parts.forEach((p, i) => {
      if (!p.part_id) errors.push(`parts[${i}].part_id missing`);
      else if (ids.has(p.part_id)) errors.push(`parts[${i}].part_id "${p.part_id}" duplicated`);
      else ids.add(p.part_id);

      const t = p.T_world_part_nominal;
      if (!t) {
        errors.push(`parts[${i}].T_world_part_nominal missing`);
      } else {
        if (!isVec3(t.translation_mm)) errors.push(`parts[${i}].translation_mm invalid`);
        if (!isQuat(t.rotation_quat_xyzw)) errors.push(`parts[${i}].rotation_quat_xyzw invalid`);
        else if (!isQuatNormalized(t.rotation_quat_xyzw)) errors.push(`parts[${i}].rotation_quat_xyzw not normalized`);
      }
    });
  }

  return errors;
}

function validateAsBuiltPoses(data) {
  const errors = [];

  if (data.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${data.schema_version}"`);
  }
  if (typeof data.dataset_id !== "string" || !data.dataset_id) {
    errors.push("dataset_id must be a non-empty string");
  }
  if (data.frame_id !== "world") {
    errors.push(`Expected frame_id "world", got "${data.frame_id}"`);
  }
  if (!isISODate(data.measured_at)) {
    errors.push("measured_at must be valid ISO date");
  }
  if (!Array.isArray(data.parts) || data.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    const ids = new Set();
    data.parts.forEach((p, i) => {
      if (!p.part_id) errors.push(`parts[${i}].part_id missing`);
      else if (ids.has(p.part_id)) errors.push(`parts[${i}].part_id "${p.part_id}" duplicated`);
      else ids.add(p.part_id);

      if (typeof p.pose_confidence !== "number" || p.pose_confidence < 0 || p.pose_confidence > 1) {
        errors.push(`parts[${i}].pose_confidence must be 0-1`);
      }

      const t = p.T_world_part_asBuilt;
      if (!t) {
        errors.push(`parts[${i}].T_world_part_asBuilt missing`);
      } else {
        if (!isVec3(t.translation_mm)) errors.push(`parts[${i}].translation_mm invalid`);
        if (!isQuat(t.rotation_quat_xyzw)) errors.push(`parts[${i}].rotation_quat_xyzw invalid`);
        else if (!isQuatNormalized(t.rotation_quat_xyzw)) errors.push(`parts[${i}].rotation_quat_xyzw not normalized`);
      }
    });
  }

  return errors;
}

function validateConstraints(data) {
  const errors = [];

  if (data.schema_version !== "v0.1") {
    errors.push(`Expected schema_version "v0.1", got "${data.schema_version}"`);
  }
  if (typeof data.dataset_id !== "string" || !data.dataset_id) {
    errors.push("dataset_id must be a non-empty string");
  }
  if (!data.engine_config || typeof data.engine_config.confidence_threshold !== "number") {
    errors.push("engine_config.confidence_threshold required");
  }
  if (!Array.isArray(data.parts) || data.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    const ids = new Set();
    const validModes = ["fixed", "free", "index"];
    data.parts.forEach((p, i) => {
      if (!p.part_id) errors.push(`parts[${i}].part_id missing`);
      else if (ids.has(p.part_id)) errors.push(`parts[${i}].part_id "${p.part_id}" duplicated`);
      else ids.add(p.part_id);

      if (!validModes.includes(p.rotation_mode)) {
        errors.push(`parts[${i}].rotation_mode must be one of: ${validModes.join(", ")}`);
      }
      if (!p.tolerances || typeof p.tolerances.translation_mm !== "number") {
        errors.push(`parts[${i}].tolerances.translation_mm required`);
      }
      if (!p.tolerances || typeof p.tolerances.rotation_deg !== "number") {
        errors.push(`parts[${i}].tolerances.rotation_deg required`);
      }
    });
  }

  return errors;
}

function validateMuseumRaw(data) {
  const errors = [];

  if (typeof data.dataset_id !== "string" || !data.dataset_id) {
    errors.push("dataset_id must be a non-empty string");
  }
  if (!isISODate(data.measured_at)) {
    errors.push("measured_at must be valid ISO date");
  }

  // Anchors
  if (!Array.isArray(data.anchors) || data.anchors.length < 3) {
    errors.push("anchors must have at least 3 points for rigid transform");
  } else {
    const ids = new Set();
    data.anchors.forEach((a, i) => {
      if (!a.anchor_id) errors.push(`anchors[${i}].anchor_id missing`);
      else if (ids.has(a.anchor_id)) errors.push(`anchors[${i}].anchor_id "${a.anchor_id}" duplicated`);
      else ids.add(a.anchor_id);

      if (!isVec3(a.model_xyz_mm)) errors.push(`anchors[${i}].model_xyz_mm invalid`);
      if (!isVec3(a.scan_xyz_mm)) errors.push(`anchors[${i}].scan_xyz_mm invalid`);
    });
  }

  // Parts
  if (!Array.isArray(data.parts) || data.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    const ids = new Set();
    data.parts.forEach((p, i) => {
      if (!p.part_id) errors.push(`parts[${i}].part_id missing`);
      else if (ids.has(p.part_id)) errors.push(`parts[${i}].part_id "${p.part_id}" duplicated`);
      else ids.add(p.part_id);

      if (!isLine3(p.nominal_line_mm)) errors.push(`parts[${i}].nominal_line_mm invalid`);
      if (!isLine3(p.scan_line_mm)) errors.push(`parts[${i}].scan_line_mm invalid`);
      if (typeof p.pose_confidence !== "number" || p.pose_confidence < 0 || p.pose_confidence > 1) {
        errors.push(`parts[${i}].pose_confidence must be 0-1`);
      }
    });
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataset definitions
// ─────────────────────────────────────────────────────────────────────────────

const DATASETS = [
  // Toy v0.1 (canonical)
  {
    name: "toy_v0_1/nominal",
    path: "datasets/toy_v0_1/toy_nominal_poses.json",
    validator: validateNominalPoses,
  },
  {
    name: "toy_v0_1/as_built",
    path: "datasets/toy_v0_1/toy_asbuilt_poses.json",
    validator: validateAsBuiltPoses,
  },
  {
    name: "toy_v0_1/constraints",
    path: "datasets/toy_v0_1/toy_constraints.json",
    validator: validateConstraints,
  },
  // Museum facade v0.1
  {
    name: "museum_facade_v0_1/museum_raw",
    path: "datasets/museum_facade_v0_1/directive_engine_export/museum_raw.json",
    validator: validateMuseumRaw,
  },
  {
    name: "museum_facade_v0_1/constraints",
    path: "datasets/museum_facade_v0_1/directive_engine_export/museum_constraints.json",
    validator: validateConstraints,
  },
];

// Legacy datasets (different schema, not validated against v0.1)
const LEGACY_DATASETS = [
  "datasets/toy_facade_v1/nominal.json",
  "datasets/toy_facade_v1/as_built.json",
  "datasets/toy_facade_v1/constraints.json",
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log("Validating v0.1 datasets...\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Show legacy datasets info
  if (LEGACY_DATASETS.length > 0 && VERBOSE) {
    console.log(colors.dim(`Note: ${LEGACY_DATASETS.length} legacy dataset(s) use different schema, skipped.\n`));
  }

  for (const dataset of DATASETS) {
    const fullPath = join(ROOT, dataset.path);

    if (!existsSync(fullPath)) {
      console.log(`${colors.yellow("SKIP")} ${dataset.name} ${colors.dim("(file not found)")}`);
      skipped++;
      continue;
    }

    try {
      const content = readFileSync(fullPath, "utf-8");
      const data = JSON.parse(content);
      const errors = dataset.validator(data);

      if (errors.length === 0) {
        console.log(`${colors.green("PASS")} ${dataset.name}`);
        passed++;
      } else {
        console.log(`${colors.red("FAIL")} ${dataset.name}`);
        if (VERBOSE) {
          errors.forEach((e) => console.log(`       ${colors.dim("→")} ${e}`));
        } else {
          console.log(`       ${colors.dim(`${errors.length} error(s) - run with --verbose for details`)}`);
        }
        failed++;
      }
    } catch (err) {
      console.log(`${colors.red("FAIL")} ${dataset.name}`);
      console.log(`       ${colors.dim("→")} ${err.message}`);
      failed++;
    }
  }

  console.log("");
  console.log("─".repeat(50));
  console.log(`Results: ${colors.green(`${passed} passed`)}, ${failed > 0 ? colors.red(`${failed} failed`) : "0 failed"}, ${skipped > 0 ? colors.yellow(`${skipped} skipped`) : "0 skipped"}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
