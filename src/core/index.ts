export { computeRigidTransform } from "./align/rigid.js";
export {
  applyTransformToLine,
  applyTransformToPoint,
  composeTransforms,
  invertTransform
} from "./align/apply.js";
export {
  ValidationError,
  validateNominalPoses,
  validateAsBuiltPoses,
  validateConstraints,
  validateInputs
} from "./validate.js";
export {
  noopTracer,
  createTracer,
  createCollectorTracer,
  mergeTracers
} from "./trace.js";
export type { TraceContext, TraceEvent } from "./trace.js";
export { generateDirectives } from "./generateDirectives.js";
export type { GenerateDirectivesOptions, GenerateDirectivesInput } from "./generateDirectives.js";
export { simulateStep } from "./simulate.js";
export type { SimulateStepInput, SimulationResult } from "./simulate.js";
export type {
  MuseumRawDataset,
  MuseumAnchor,
  MuseumPart,
  AnchorPointPairs
} from "./museum/raw.js";
export { anchorsToPointPairs } from "./museum/raw.js";

// Point Cloud Fitting
export {
  fitPartToPointCloud,
  getWorldReferencePoints,
  computeDOFMovement,
  formatDOFMovement,
  checkDOFTolerance,
  decomposeDOFMovement,
  DEFAULT_FIT_CONFIG,
} from "./fit/index.js";
export type {
  Point3D,
  PointCloud,
  FabPartGeometry,
  FabPartPointSetGeometry,
  FabPartLineGeometry,
  FabPartPlaneGeometry,
  FabPartCylinderGeometry,
  TranslationDOF,
  RotationDOF,
  DOFMovement,
  PointDeviation,
  DeviationStats,
  FitResult,
  FitConfig,
  DOFTolerances,
  DOFToleranceResult,
  ConstrainedDOF,
  DecomposedDOF,
} from "./fit/index.js";
