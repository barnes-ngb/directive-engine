/**
 * Fab Part Point Cloud Fitting Module.
 *
 * Provides tools for fitting fab part geometry to scanned point clouds,
 * computing DOF (degrees of freedom) movement, and analyzing deviations.
 *
 * @example
 * ```ts
 * import { fitPartToPointCloud, formatDOFMovement } from "./fit/index.js";
 *
 * const geometry: FabPartLineGeometry = {
 *   geometry_type: "line",
 *   part_id: "MULLION-001",
 *   start_mm: [0, 0, 0],
 *   end_mm: [0, 0, 3000],
 *   T_world_part_nominal: {
 *     translation_mm: [1000, 500, 0],
 *     rotation_quat_xyzw: [0, 0, 0, 1],
 *   },
 * };
 *
 * const pointCloud: PointCloud = {
 *   points: scanData.map(p => ({ point_mm: p })),
 * };
 *
 * const result = fitPartToPointCloud(geometry, pointCloud);
 * console.log(formatDOFMovement(result.dof_movement));
 * console.log(`Fit RMS: ${result.fit_rms_mm.toFixed(3)} mm`);
 * ```
 */

// Types
export type {
  Point3D,
  PointCloud,
  FabPartGeometry,
  FabPartGeometryType,
  FabPartPointSetGeometry,
  FabPartLineGeometry,
  FabPartPlaneGeometry,
  FabPartCylinderGeometry,
  TranslationDOF,
  RotationDOF,
  DOFMovement,
  PointDeviation,
  DeviationStats,
  PointCorrespondence,
  FitResult,
  FitConfig,
} from "./types.js";

export { DEFAULT_FIT_CONFIG } from "./types.js";

// ICP Fitting
export { fitPartToPointCloud, getWorldReferencePoints } from "./icp.js";

// DOF Analysis
export {
  computeDOFMovement,
  computeTranslationDOF,
  computeRotationDOF,
  formatDOFMovement,
  checkDOFTolerance,
  decomposeDOFMovement,
} from "./dof.js";
export type { DOFTolerances, DOFToleranceResult, ConstrainedDOF, DecomposedDOF } from "./dof.js";
