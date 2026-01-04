export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x,y,z,w]

export type Axis = "x" | "y" | "z";
export type AxisMask = { x: boolean; y: boolean; z: boolean };

export interface Transform {
  translation_mm: Vec3;
  rotation_quat_xyzw: Quat;
}

export interface NominalPartPose {
  part_id: string;
  part_name: string;
  part_type: string;
  T_world_part_nominal: Transform;
}

export interface NominalPosesDataset {
  schema_version: "v0.1";
  dataset_id: string;
  frame_id: "world";
  units: { length: "mm"; rotation: "quaternion_xyzw" };
  parts: NominalPartPose[];
}

export interface AsBuiltPartPose {
  part_id: string;
  T_world_part_asBuilt: Transform;
  pose_confidence: number; // 0..1
  confidence_notes?: string;
}

export interface AsBuiltPosesDataset {
  schema_version: "v0.1";
  dataset_id: string;
  frame_id: "world";
  units: { length: "mm"; rotation: "quaternion_xyzw" };
  measured_at: string; // ISO 8601
  parts: AsBuiltPartPose[];
}

export type RotationMode = "fixed" | "free" | "index";

export interface PerAxisLimitMm { x: number; y: number; z: number }
export interface PerAxisLimitDeg { x: number; y: number; z: number }

export interface IndexRotation {
  axis: Axis;
  increment_deg: number;
  allowed_indices: number[];
  nominal_index: number;
}

export interface Tolerances {
  translation_mm: number;
  rotation_deg: number;
}

export interface PartConstraint {
  part_id: string;
  allowed_translation_axes: AxisMask;
  rotation_mode: RotationMode;
  allowed_rotation_axes: AxisMask;
  translation_max_abs_mm?: PerAxisLimitMm;
  translation_max_norm_mm?: number;
  rotation_max_abs_deg?: PerAxisLimitDeg;
  index_rotation?: IndexRotation;
  tolerances: Tolerances;
  verification?: { method: "measure_pose" | "re_scan" | "manual_inspection"; notes?: string };
}

export interface ConstraintsDataset {
  schema_version: "v0.1";
  dataset_id: string;
  engine_config: {
    confidence_threshold: number;
    translation_clamp_policy?: "none" | "per_axis_max_abs" | "vector_norm_max";
  };
  parts: PartConstraint[];
}

export type Status = "ok" | "pending" | "clamped" | "blocked" | "needs_review";
export type ActionType = "translate" | "rotate" | "rotate_to_index" | "noop";

/**
 * Well-known reason codes for directive steps.
 * These explain why a particular status or action was assigned.
 */
export const ReasonCode = {
  // Input issues
  MISSING_INPUT_DATA: "missing_input_data",
  LOW_CONFIDENCE: "low_confidence",

  // Within tolerance
  WITHIN_TOLERANCE: "within_tolerance",

  // Translation reasons
  TRANSLATION_OUT_OF_TOLERANCE: "translation_out_of_tolerance",
  TRANSLATION_EXCEEDS_MAX_NORM: "translation_exceeds_max_norm",
  TRANSLATE_ONLY: "translate_only",
  TRANSLATE_CLAMPED: "translate_clamped",

  // Rotation reasons
  ROTATION_OUT_OF_TOLERANCE: "rotation_out_of_tolerance",
  ROTATION_CLAMPED: "rotation_clamped",
  ROTATION_FREE_SINGLE_AXIS: "rotation_free_single_axis",
  ROTATION_LOCKED_BLOCKED: "rotation_locked_blocked",
  INDEX_ROTATION: "index_rotation",
  INDEX_ROTATION_CONFIG_MISSING: "index_rotation_config_missing",

  // Limit reasons
  OUTSIDE_LIMITS_BLOCKED: "outside_limits_blocked",
  CLAMPED_TO_LIMITS: "clamped_to_limits",
} as const;

export type ReasonCodeType = typeof ReasonCode[keyof typeof ReasonCode];

export interface TransformDelta {
  translation_mm: Vec3;
  rotation_quat_xyzw: Quat;
}

export interface Action {
  action_id: string;
  type: ActionType;
  description: string;
  delta?: TransformDelta;
  clamp_applied?: boolean;
  original_delta?: TransformDelta;
  axis?: Axis;
  target_index?: number;
}

export interface Verification {
  verification_id: string;
  type: "measure_pose" | "re_scan" | "manual_inspection";
  acceptance: { translation_mm: number; rotation_deg: number };
  expected_residual: { translation_mm_vec: Vec3; rotation_deg: number };
  expected_result: "expected_pass" | "expected_fail" | "unknown";
  notes?: string;
}

export interface ComputedErrors {
  translation_error_mm_vec: Vec3;
  translation_error_norm_mm: number;
  rotation_error_deg: number;
}

export interface Step {
  step_id: string;
  part_id: string;
  status: Status;
  reason_codes: ReasonCodeType[];
  pose_confidence?: number;
  computed_errors: ComputedErrors;
  actions: Action[];
  verification: Verification[];
}

export interface DirectivesOutput {
  schema_version: "v0.1";
  dataset_id: string;
  engine_version: string;
  generated_at: string;
  inputs: {
    nominal_poses: string;
    as_built_poses: string;
    constraints: string;
    confidence_threshold: number;
  };
  summary: {
    counts_by_status: Record<Status, number>;
  };
  steps: Step[];
}
