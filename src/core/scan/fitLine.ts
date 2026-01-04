/**
 * PCA-based line fitting for point clouds.
 * Fits a best-fit line through a set of 3D points using Principal Component Analysis.
 */

import type { Vec3 } from "../types.js";
import { add, sub, scale, norm } from "../math/vec.js";
import type { ScanPoint } from "./segment.js";

export interface LineFitResult {
  /** Centroid of the point cloud */
  centroid: Vec3;
  /** Principal direction (unit vector) */
  direction: Vec3;
  /** RMS distance of points to the fitted line (mm) */
  fit_rms_mm: number;
  /** Number of points used in the fit */
  point_count: number;
  /** Variance explained by the principal axis (0-1) */
  variance_explained: number;
  /** Line endpoints (projected extent of the data along the principal axis) */
  line_p0: Vec3;
  line_p1: Vec3;
}

/**
 * Compute the centroid (mean) of a set of points.
 */
export function computeCentroid(points: Vec3[]): Vec3 {
  if (points.length === 0) {
    return [0, 0, 0];
  }

  let sum: Vec3 = [0, 0, 0];
  for (const p of points) {
    sum = add(sum, p);
  }
  return scale(sum, 1 / points.length);
}

/**
 * Build the 3x3 covariance matrix for a set of centered points.
 * Returns matrix in row-major order as [row0, row1, row2].
 */
function buildCovarianceMatrix(centeredPoints: Vec3[]): number[][] {
  const n = centeredPoints.length;
  if (n === 0) {
    return [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  }

  // Initialize 3x3 matrix
  const C = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const p of centeredPoints) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        C[i][j] += p[i] * p[j];
      }
    }
  }

  // Normalize by n (or n-1 for sample covariance, but n is fine for PCA)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i][j] /= n;
    }
  }

  return C;
}

/**
 * Compute eigenvalue/eigenvector of a 3x3 symmetric matrix using power iteration.
 * Returns the largest eigenvalue and corresponding eigenvector.
 */
function powerIteration(
  matrix: number[][],
  maxIter = 100,
  tol = 1e-10
): { eigenvalue: number; eigenvector: Vec3 } {
  // Start with a random-ish vector
  let v: Vec3 = [1, 0.5, 0.3];
  let vNorm = norm(v);
  v = scale(v, 1 / vNorm) as Vec3;

  let eigenvalue = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Matrix-vector multiply
    const Av: Vec3 = [
      matrix[0][0] * v[0] + matrix[0][1] * v[1] + matrix[0][2] * v[2],
      matrix[1][0] * v[0] + matrix[1][1] * v[1] + matrix[1][2] * v[2],
      matrix[2][0] * v[0] + matrix[2][1] * v[1] + matrix[2][2] * v[2],
    ];

    const newEigenvalue = norm(Av);
    if (newEigenvalue < 1e-12) {
      // Degenerate matrix
      return { eigenvalue: 0, eigenvector: [1, 0, 0] };
    }

    const newV = scale(Av, 1 / newEigenvalue) as Vec3;

    // Check convergence
    const diff = norm(sub(newV, v));
    v = newV;
    eigenvalue = newEigenvalue;

    if (diff < tol) {
      break;
    }
  }

  return { eigenvalue, eigenvector: v };
}

/**
 * Compute all three eigenvalues of a 3x3 symmetric matrix.
 * Uses deflation after finding each eigenvalue via power iteration.
 */
function computeAllEigenvalues(matrix: number[][]): number[] {
  const eigenvalues: number[] = [];
  const M = matrix.map((row) => [...row]); // Copy

  for (let i = 0; i < 3; i++) {
    const { eigenvalue, eigenvector } = powerIteration(M);
    eigenvalues.push(eigenvalue);

    // Deflate: M = M - eigenvalue * v * v^T
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        M[r][c] -= eigenvalue * eigenvector[r] * eigenvector[c];
      }
    }
  }

  return eigenvalues;
}

/**
 * Compute the perpendicular distance from a point to a line.
 */
function pointToLineDist(point: Vec3, linePoint: Vec3, lineDir: Vec3): number {
  const v = sub(point, linePoint);
  const proj = v[0] * lineDir[0] + v[1] * lineDir[1] + v[2] * lineDir[2];
  const closest = add(linePoint, scale(lineDir, proj));
  return norm(sub(point, closest));
}

/**
 * Fit a line to a set of 3D points using PCA.
 *
 * @param scanPoints Points to fit (must have at least 2 points)
 * @returns Line fit result with centroid, direction, and quality metrics
 * @throws Error if fewer than 2 points provided
 */
export function fitLinePCA(scanPoints: ScanPoint[]): LineFitResult {
  const points = scanPoints.map((p) => p.point_mm);

  if (points.length < 2) {
    throw new Error("fitLinePCA requires at least 2 points");
  }

  // Step 1: Compute centroid
  const centroid = computeCentroid(points);

  // Step 2: Center the points
  const centered = points.map((p) => sub(p, centroid));

  // Step 3: Build covariance matrix
  const cov = buildCovarianceMatrix(centered);

  // Step 4: Find principal eigenvector (dominant direction)
  const { eigenvalue: lambda1, eigenvector: direction } = powerIteration(cov);

  // Step 5: Compute all eigenvalues for variance explained
  const eigenvalues = computeAllEigenvalues(cov);
  const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
  const variance_explained = totalVariance > 0 ? lambda1 / totalVariance : 1;

  // Step 6: Compute RMS distance to fitted line
  let sumSq = 0;
  for (const p of points) {
    const dist = pointToLineDist(p, centroid, direction);
    sumSq += dist * dist;
  }
  const fit_rms_mm = Math.sqrt(sumSq / points.length);

  // Step 7: Find line extent (project all points onto line direction)
  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const cp of centered) {
    const proj = cp[0] * direction[0] + cp[1] * direction[1] + cp[2] * direction[2];
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  // Line endpoints
  const line_p0 = add(centroid, scale(direction, minProj));
  const line_p1 = add(centroid, scale(direction, maxProj));

  return {
    centroid,
    direction,
    fit_rms_mm,
    point_count: points.length,
    variance_explained,
    line_p0,
    line_p1,
  };
}
