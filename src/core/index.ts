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

// Scan processing
export {
  pointToLineDistance,
  isProjectionWithinSegment,
  segmentPointsNearLine,
  fitLinePCA,
  computeCentroid,
  poseFromLineFit,
  directionToQuaternion,
  directionToQuaternionFull,
  generateSyntheticLinePoints,
  generateSyntheticScan,
  DEFAULT_CONFIDENCE_CONFIG,
  DEFAULT_SYNTHETIC_CONFIG,
} from "./scan/index.js";
export type {
  ScanPoint,
  SegmentationResult,
  SegmentOptions,
  LineFitResult,
  PoseFromFitResult,
  ConfidenceConfig,
  SyntheticLineConfig,
} from "./scan/index.js";
