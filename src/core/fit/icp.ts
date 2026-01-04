/**
 * Iterative Closest Point (ICP) algorithm for point cloud fitting.
 *
 * Fits a fab part's reference geometry to a scanned point cloud by iteratively:
 * 1. Finding closest point correspondences
 * 2. Computing optimal rigid transform using Horn's method
 * 3. Applying transform and repeating until convergence
 */
import type { Transform, Vec3 } from "../types.js";
import type {
  Point3D,
  PointCloud,
  FabPartGeometry,
  FitResult,
  FitConfig,
  PointCorrespondence,
  PointDeviation,
  DeviationStats,
  DOFMovement,
} from "./types.js";
import { DEFAULT_FIT_CONFIG } from "./types.js";
import { norm, sub, add, scale } from "../math/vec.js";
import { identity, multiply, normalize } from "../math/quat.js";
import { applyTransformToPoint, composeTransforms, invertTransform } from "../align/apply.js";
import { computeDOFMovement } from "./dof.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the reference points from a fab part geometry in world frame.
 */
export function getWorldReferencePoints(geometry: FabPartGeometry): Point3D[] {
  const T = geometry.T_world_part_nominal;

  switch (geometry.geometry_type) {
    case "point_set":
      return geometry.reference_points.map((p) => ({
        point_id: p.point_id,
        point_mm: applyTransformToPoint(T, p.point_mm),
      }));

    case "line": {
      // Sample points along the line
      const start = applyTransformToPoint(T, geometry.start_mm);
      const end = applyTransformToPoint(T, geometry.end_mm);
      const samples = sampleLine(start, end, 10);
      return samples.map((pt, i) => ({ point_id: `line_${i}`, point_mm: pt }));
    }

    case "plane": {
      // Sample points on the plane
      const origin = applyTransformToPoint(T, geometry.origin_mm);
      const samples = samplePlane(origin, geometry.normal, geometry.extents_mm, 25);
      return samples.map((pt, i) => ({ point_id: `plane_${i}`, point_mm: pt }));
    }

    case "cylinder": {
      // Sample points on the cylinder surface
      const axisStart = applyTransformToPoint(T, geometry.axis_start_mm);
      const axisEnd = applyTransformToPoint(T, geometry.axis_end_mm);
      const samples = sampleCylinder(axisStart, axisEnd, geometry.radius_mm, 36);
      return samples.map((pt, i) => ({ point_id: `cyl_${i}`, point_mm: pt }));
    }

    default:
      return [];
  }
}

/**
 * Sample points along a line segment.
 */
function sampleLine(start: Vec3, end: Vec3, numSamples: number): Vec3[] {
  const samples: Vec3[] = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    samples.push([
      start[0] + t * (end[0] - start[0]),
      start[1] + t * (end[1] - start[1]),
      start[2] + t * (end[2] - start[2]),
    ]);
  }
  return samples;
}

/**
 * Sample points on a plane (grid pattern).
 */
function samplePlane(
  origin: Vec3,
  normal: Vec3,
  extents?: { width: number; height: number },
  numSamples?: number
): Vec3[] {
  const w = extents?.width ?? 100;
  const h = extents?.height ?? 100;
  const n = numSamples ?? 25;
  const gridSize = Math.ceil(Math.sqrt(n));

  // Create basis vectors perpendicular to normal
  const up: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalizeVec(cross(up, normal));
  const v = cross(normal, u);

  const samples: Vec3[] = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const s = (i / (gridSize - 1) - 0.5) * w;
      const t = (j / (gridSize - 1) - 0.5) * h;
      samples.push([
        origin[0] + s * u[0] + t * v[0],
        origin[1] + s * u[1] + t * v[1],
        origin[2] + s * u[2] + t * v[2],
      ]);
    }
  }
  return samples;
}

/**
 * Sample points on a cylinder surface.
 */
function sampleCylinder(
  axisStart: Vec3,
  axisEnd: Vec3,
  radius: number,
  numCircumference: number
): Vec3[] {
  const axis = sub(axisEnd, axisStart);
  const axisLen = norm(axis);
  if (axisLen < 1e-6) return [axisStart];

  const axisNorm = scale(axis, 1 / axisLen);

  // Create perpendicular vectors
  const up: Vec3 = Math.abs(axisNorm[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalizeVec(cross(up, axisNorm));
  const v = cross(axisNorm, u);

  const samples: Vec3[] = [];
  const numAxial = Math.max(2, Math.floor(axisLen / 50)); // Sample every 50mm along axis

  for (let i = 0; i < numAxial; i++) {
    const t = i / (numAxial - 1);
    const center: Vec3 = [
      axisStart[0] + t * axis[0],
      axisStart[1] + t * axis[1],
      axisStart[2] + t * axis[2],
    ];

    for (let j = 0; j < numCircumference; j++) {
      const angle = (2 * Math.PI * j) / numCircumference;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      samples.push([
        center[0] + radius * (cos * u[0] + sin * v[0]),
        center[1] + radius * (cos * u[1] + sin * v[1]),
        center[2] + radius * (cos * u[2] + sin * v[2]),
      ]);
    }
  }
  return samples;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeVec(v: Vec3): Vec3 {
  const n = norm(v);
  if (n < 1e-10) return [1, 0, 0];
  return scale(v, 1 / n);
}

/**
 * Compute the centroid of a set of points.
 */
function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  const sum: Vec3 = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

/**
 * Find closest point correspondences between scan and reference points.
 */
function findCorrespondences(
  scanPoints: Point3D[],
  referencePoints: Point3D[],
  maxDistance: number
): PointCorrespondence[] {
  const correspondences: PointCorrespondence[] = [];

  for (const scanPt of scanPoints) {
    let bestRef: Point3D | null = null;
    let bestDist = Infinity;

    for (const refPt of referencePoints) {
      const dist = norm(sub(scanPt.point_mm, refPt.point_mm));
      if (dist < bestDist) {
        bestDist = dist;
        bestRef = refPt;
      }
    }

    if (bestRef && bestDist <= maxDistance) {
      correspondences.push({
        scan_point: scanPt,
        reference_point: bestRef,
        distance_mm: bestDist,
      });
    }
  }

  return correspondences;
}

/**
 * Compute rigid transform from correspondences using Horn's method.
 * Returns transform that maps scan points to reference points.
 */
function computeTransformFromCorrespondences(
  correspondences: PointCorrespondence[]
): { transform: Transform; rms: number } {
  if (correspondences.length < 3) {
    return {
      transform: { translation_mm: [0, 0, 0], rotation_quat_xyzw: identity() },
      rms: Infinity,
    };
  }

  const scanPts = correspondences.map((c) => c.scan_point.point_mm);
  const refPts = correspondences.map((c) => c.reference_point.point_mm);

  const scanCentroid = centroid(scanPts);
  const refCentroid = centroid(refPts);

  // Build covariance matrix H
  let sxx = 0, sxy = 0, sxz = 0;
  let syx = 0, syy = 0, syz = 0;
  let szx = 0, szy = 0, szz = 0;

  for (let i = 0; i < correspondences.length; i++) {
    const s = sub(scanPts[i], scanCentroid);
    const r = sub(refPts[i], refCentroid);

    sxx += s[0] * r[0]; sxy += s[0] * r[1]; sxz += s[0] * r[2];
    syx += s[1] * r[0]; syy += s[1] * r[1]; syz += s[1] * r[2];
    szx += s[2] * r[0]; szy += s[2] * r[1]; szz += s[2] * r[2];
  }

  // Build N matrix for quaternion extraction
  const nMatrix = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];

  // Power iteration to find dominant eigenvector
  let q = [1, 0, 0, 0];
  for (let iter = 0; iter < 100; iter++) {
    const newQ = [
      nMatrix[0][0] * q[0] + nMatrix[0][1] * q[1] + nMatrix[0][2] * q[2] + nMatrix[0][3] * q[3],
      nMatrix[1][0] * q[0] + nMatrix[1][1] * q[1] + nMatrix[1][2] * q[2] + nMatrix[1][3] * q[3],
      nMatrix[2][0] * q[0] + nMatrix[2][1] * q[1] + nMatrix[2][2] * q[2] + nMatrix[2][3] * q[3],
      nMatrix[3][0] * q[0] + nMatrix[3][1] * q[1] + nMatrix[3][2] * q[2] + nMatrix[3][3] * q[3],
    ];
    const len = Math.sqrt(newQ[0] ** 2 + newQ[1] ** 2 + newQ[2] ** 2 + newQ[3] ** 2);
    if (len < 1e-10) break;
    q = [newQ[0] / len, newQ[1] / len, newQ[2] / len, newQ[3] / len];
  }

  const [qw, qx, qy, qz] = q;
  const rotation_quat_xyzw = normalize([qx, qy, qz, qw]);

  // Compute translation
  const rotatedScanCentroid = applyTransformToPoint(
    { translation_mm: [0, 0, 0], rotation_quat_xyzw },
    scanCentroid
  );
  const translation_mm = sub(refCentroid, rotatedScanCentroid);

  const transform: Transform = { translation_mm, rotation_quat_xyzw };

  // Compute RMS
  let sumSq = 0;
  for (let i = 0; i < correspondences.length; i++) {
    const transformed = applyTransformToPoint(transform, scanPts[i]);
    const residual = sub(refPts[i], transformed);
    sumSq += residual[0] ** 2 + residual[1] ** 2 + residual[2] ** 2;
  }
  const rms = Math.sqrt(sumSq / correspondences.length);

  return { transform, rms };
}

/**
 * Compute deviation statistics from point-to-geometry distances.
 */
function computeDeviationStats(deviations: PointDeviation[]): DeviationStats {
  if (deviations.length === 0) {
    return {
      rms_mm: 0,
      max_mm: 0,
      min_mm: 0,
      mean_mm: 0,
      std_mm: 0,
      point_count: 0,
    };
  }

  const distances = deviations.map((d) => d.distance_mm);
  const sum = distances.reduce((a, b) => a + b, 0);
  const mean = sum / distances.length;
  const sumSq = distances.reduce((a, b) => a + b * b, 0);
  const rms = Math.sqrt(sumSq / distances.length);
  const variance = distances.reduce((a, b) => a + (b - mean) ** 2, 0) / distances.length;
  const std = Math.sqrt(variance);

  return {
    rms_mm: rms,
    max_mm: Math.max(...distances),
    min_mm: Math.min(...distances),
    mean_mm: mean,
    std_mm: std,
    point_count: distances.length,
  };
}

/**
 * Compute per-point deviations after fitting.
 */
function computePointDeviations(
  scanPoints: Point3D[],
  referencePoints: Point3D[],
  transform: Transform
): PointDeviation[] {
  const deviations: PointDeviation[] = [];

  for (const scanPt of scanPoints) {
    const transformedPt = applyTransformToPoint(transform, scanPt.point_mm);

    // Find closest reference point
    let bestDist = Infinity;
    let bestVec: Vec3 = [0, 0, 0];

    for (const refPt of referencePoints) {
      const vec = sub(refPt.point_mm, transformedPt);
      const dist = norm(vec);
      if (dist < bestDist) {
        bestDist = dist;
        bestVec = vec;
      }
    }

    deviations.push({
      point_id: scanPt.point_id,
      point_mm: scanPt.point_mm,
      distance_mm: bestDist,
      deviation_vec_mm: bestVec,
    });
  }

  return deviations;
}

// ============================================================================
// Main ICP Fitting Function
// ============================================================================

/**
 * Fit a fab part to a point cloud using ICP.
 *
 * @param geometry - The fab part's reference geometry
 * @param pointCloud - The scanned point cloud
 * @param config - Optional configuration parameters
 * @returns Fit result with DOF movement and deviation analysis
 */
export function fitPartToPointCloud(
  geometry: FabPartGeometry,
  pointCloud: PointCloud,
  config?: FitConfig
): FitResult {
  const cfg = { ...DEFAULT_FIT_CONFIG, ...config };

  // Get reference points in world frame
  const referencePoints = getWorldReferencePoints(geometry);

  if (referencePoints.length === 0) {
    throw new Error(`No reference points could be generated for part ${geometry.part_id}`);
  }

  if (pointCloud.points.length === 0) {
    throw new Error("Point cloud is empty");
  }

  // Start with identity transform (scan is already in world frame)
  let currentTransform: Transform = {
    translation_mm: [0, 0, 0],
    rotation_quat_xyzw: identity(),
  };

  let prevRms = Infinity;
  let iterations = 0;
  let converged = false;
  let finalCorrespondences: PointCorrespondence[] = [];

  // ICP loop
  for (let iter = 0; iter < cfg.max_iterations; iter++) {
    iterations = iter + 1;

    // Transform scan points by current estimate
    const transformedScan = pointCloud.points.map((p) => ({
      ...p,
      point_mm: applyTransformToPoint(currentTransform, p.point_mm),
    }));

    // Find correspondences
    const correspondences = findCorrespondences(
      transformedScan,
      referencePoints,
      cfg.max_correspondence_distance_mm
    );

    if (correspondences.length < 3) {
      break;
    }

    // Compute incremental transform from current positions
    const { transform: deltaT, rms } = computeTransformFromCorrespondences(correspondences);

    // Compose with current transform
    currentTransform = composeTransforms(currentTransform, deltaT);

    finalCorrespondences = correspondences;

    // Check convergence
    if (Math.abs(prevRms - rms) < cfg.convergence_threshold_mm) {
      converged = true;
      break;
    }
    prevRms = rms;
  }

  // Compute final deviations
  const pointDeviations = computePointDeviations(
    pointCloud.points,
    referencePoints,
    currentTransform
  );

  const deviationStats = computeDeviationStats(pointDeviations);

  // Compute DOF movement from nominal to fitted
  // The fitted pose = nominal pose composed with the inverse of how scan moved
  const T_nominal = geometry.T_world_part_nominal;
  const T_fitted = composeTransforms(invertTransform(currentTransform), T_nominal);
  const dofMovement = computeDOFMovement(T_nominal, T_fitted);

  const result: FitResult = {
    part_id: geometry.part_id,
    T_world_part_fitted: T_fitted,
    dof_movement: dofMovement,
    deviation_stats: deviationStats,
    fit_rms_mm: deviationStats.rms_mm,
    iterations,
    converged,
  };

  if (cfg.include_point_deviations) {
    result.point_deviations = pointDeviations;
  }

  if (cfg.include_correspondences) {
    result.correspondences = finalCorrespondences;
  }

  return result;
}
