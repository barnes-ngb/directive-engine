/**
 * Types for fab part point cloud fitting.
 *
 * This module defines the data structures for fitting a fab part's
 * reference geometry to a scanned point cloud and analyzing DOF movement.
 */
import type { Quat, Transform, Vec3 } from "../types.js";

// ============================================================================
// Point Cloud Types
// ============================================================================

/**
 * A single 3D point, optionally with an ID for correspondence tracking.
 */
export interface Point3D {
  point_mm: Vec3;
  point_id?: string;
}

/**
 * A point cloud from scan data.
 */
export interface PointCloud {
  points: Point3D[];
  /** Optional metadata about the scan */
  scan_id?: string;
  /** Timestamp of scan (ISO 8601) */
  scanned_at?: string;
}

// ============================================================================
// Fab Part Geometry Types
// ============================================================================

/**
 * Geometry types supported for fab parts.
 */
export type FabPartGeometryType = "point_set" | "line" | "plane" | "cylinder";

/**
 * Base interface for fab part geometry.
 */
export interface FabPartGeometryBase {
  geometry_type: FabPartGeometryType;
  part_id: string;
  part_name?: string;
}

/**
 * Fab part defined by a set of reference points (most flexible).
 * Use for complex shapes or when you have specific anchor points on the part.
 */
export interface FabPartPointSetGeometry extends FabPartGeometryBase {
  geometry_type: "point_set";
  /** Reference points in part-local coordinates */
  reference_points: Point3D[];
  /** Nominal pose of the part in world frame */
  T_world_part_nominal: Transform;
}

/**
 * Fab part defined as a line segment (e.g., mullion, beam).
 */
export interface FabPartLineGeometry extends FabPartGeometryBase {
  geometry_type: "line";
  /** Start point in part-local coordinates */
  start_mm: Vec3;
  /** End point in part-local coordinates */
  end_mm: Vec3;
  /** Nominal pose of the part in world frame */
  T_world_part_nominal: Transform;
}

/**
 * Fab part defined as a plane (e.g., panel face).
 */
export interface FabPartPlaneGeometry extends FabPartGeometryBase {
  geometry_type: "plane";
  /** Point on the plane in part-local coordinates */
  origin_mm: Vec3;
  /** Normal vector (unit length) */
  normal: Vec3;
  /** Plane extents for bounded fitting */
  extents_mm?: { width: number; height: number };
  /** Nominal pose of the part in world frame */
  T_world_part_nominal: Transform;
}

/**
 * Fab part defined as a cylinder (e.g., pipe, column).
 */
export interface FabPartCylinderGeometry extends FabPartGeometryBase {
  geometry_type: "cylinder";
  /** Axis start point in part-local coordinates */
  axis_start_mm: Vec3;
  /** Axis end point in part-local coordinates */
  axis_end_mm: Vec3;
  /** Cylinder radius */
  radius_mm: number;
  /** Nominal pose of the part in world frame */
  T_world_part_nominal: Transform;
}

/**
 * Union type for all fab part geometries.
 */
export type FabPartGeometry =
  | FabPartPointSetGeometry
  | FabPartLineGeometry
  | FabPartPlaneGeometry
  | FabPartCylinderGeometry;

// ============================================================================
// DOF Movement Types
// ============================================================================

/**
 * Translation movement broken down by axis.
 */
export interface TranslationDOF {
  /** Translation along X axis (mm) */
  x_mm: number;
  /** Translation along Y axis (mm) */
  y_mm: number;
  /** Translation along Z axis (mm) */
  z_mm: number;
  /** Total translation magnitude (mm) */
  magnitude_mm: number;
}

/**
 * Rotation movement broken down by axis (Euler angles).
 */
export interface RotationDOF {
  /** Rotation about X axis (degrees) - Roll */
  rx_deg: number;
  /** Rotation about Y axis (degrees) - Pitch */
  ry_deg: number;
  /** Rotation about Z axis (degrees) - Yaw */
  rz_deg: number;
  /** Total rotation magnitude as axis-angle (degrees) */
  magnitude_deg: number;
}

/**
 * Complete DOF movement analysis.
 * Represents how the as-built part has moved from its nominal position.
 */
export interface DOFMovement {
  /** Translation movement from nominal */
  translation: TranslationDOF;
  /** Rotation movement from nominal */
  rotation: RotationDOF;
  /** The delta quaternion representing the rotation */
  rotation_quat_xyzw: Quat;
}

// ============================================================================
// Deviation Metrics Types
// ============================================================================

/**
 * Per-point deviation from fitted geometry.
 */
export interface PointDeviation {
  point_id?: string;
  point_mm: Vec3;
  /** Distance to nearest point on fitted geometry (mm) */
  distance_mm: number;
  /** Vector from point to nearest geometry point (mm) */
  deviation_vec_mm: Vec3;
}

/**
 * Surface deviation statistics.
 */
export interface DeviationStats {
  /** Root mean square deviation (mm) */
  rms_mm: number;
  /** Maximum deviation (mm) */
  max_mm: number;
  /** Minimum deviation (mm) */
  min_mm: number;
  /** Mean deviation (mm) */
  mean_mm: number;
  /** Standard deviation (mm) */
  std_mm: number;
  /** Number of points analyzed */
  point_count: number;
}

// ============================================================================
// Fit Result Types
// ============================================================================

/**
 * Correspondence between a scan point and a reference point.
 */
export interface PointCorrespondence {
  scan_point: Point3D;
  reference_point: Point3D;
  distance_mm: number;
}

/**
 * Result of fitting a fab part to a point cloud.
 */
export interface FitResult {
  /** The part that was fitted */
  part_id: string;

  /** Best-fit transform: T_world_part_fitted */
  T_world_part_fitted: Transform;

  /** DOF movement from nominal to fitted pose */
  dof_movement: DOFMovement;

  /** Deviation statistics after fitting */
  deviation_stats: DeviationStats;

  /** Per-point deviations (optional, can be large) */
  point_deviations?: PointDeviation[];

  /** RMS error of the fit (mm) */
  fit_rms_mm: number;

  /** Number of ICP iterations performed */
  iterations: number;

  /** Whether the fit converged */
  converged: boolean;

  /** Final correspondences used (optional) */
  correspondences?: PointCorrespondence[];
}

// ============================================================================
// Fit Configuration Types
// ============================================================================

/**
 * Configuration for the ICP fitting algorithm.
 */
export interface FitConfig {
  /** Maximum number of ICP iterations */
  max_iterations?: number;
  /** Convergence threshold for transform change (mm) */
  convergence_threshold_mm?: number;
  /** Maximum correspondence distance (mm) - points further are rejected */
  max_correspondence_distance_mm?: number;
  /** Whether to include per-point deviations in result */
  include_point_deviations?: boolean;
  /** Whether to include correspondences in result */
  include_correspondences?: boolean;
}

/**
 * Default fit configuration values.
 */
export const DEFAULT_FIT_CONFIG: Required<FitConfig> = {
  max_iterations: 50,
  convergence_threshold_mm: 0.001,
  max_correspondence_distance_mm: 100,
  include_point_deviations: false,
  include_correspondences: false,
};
