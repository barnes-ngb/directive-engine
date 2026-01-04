/**
 * Scan processing module: segmentation, line fitting, and pose extraction.
 */

export {
  pointToLineDistance,
  isProjectionWithinSegment,
  segmentPointsNearLine,
  type ScanPoint,
  type SegmentationResult,
  type SegmentOptions,
} from "./segment.js";

export {
  fitLinePCA,
  computeCentroid,
  type LineFitResult,
} from "./fitLine.js";

export {
  poseFromLineFit,
  directionToQuaternion,
  directionToQuaternionFull,
  DEFAULT_CONFIDENCE_CONFIG,
  type PoseFromFitResult,
  type ConfidenceConfig,
} from "./poseFromFit.js";

export {
  generateSyntheticLinePoints,
  generateSyntheticScan,
  DEFAULT_SYNTHETIC_CONFIG,
  type SyntheticLineConfig,
} from "./synthetic.js";
