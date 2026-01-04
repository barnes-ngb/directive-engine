/**
 * Synthetic point cloud generation for testing the scan-to-pose pipeline.
 */

import type { Vec3 } from "../types.js";
import { add, sub, scale, norm } from "../math/vec.js";
import type { ScanPoint } from "./segment.js";

export interface SyntheticLineConfig {
  /** Number of points to generate along the line */
  num_points: number;
  /** Standard deviation of noise perpendicular to line (mm) */
  noise_perpendicular_mm: number;
  /** Standard deviation of noise along the line (mm) */
  noise_along_mm: number;
  /** If true, add random outliers */
  add_outliers?: boolean;
  /** Number of outliers to add */
  num_outliers?: number;
  /** Random seed for reproducibility (if using seeded RNG) */
  seed?: number;
}

export const DEFAULT_SYNTHETIC_CONFIG: SyntheticLineConfig = {
  num_points: 50,
  noise_perpendicular_mm: 3,
  noise_along_mm: 1,
  add_outliers: false,
  num_outliers: 5,
};

/**
 * Simple seeded random number generator (Linear Congruential Generator).
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Generate a normally distributed random number using Box-Muller transform.
 */
function normalRandom(mean: number, stdDev: number, rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

/**
 * Create two perpendicular vectors to a given direction.
 */
function createPerpendicularBasis(direction: Vec3): { u: Vec3; v: Vec3 } {
  // Find a vector not parallel to direction
  let ref: Vec3 = [1, 0, 0];
  const dot = Math.abs(direction[0] * ref[0] + direction[1] * ref[1] + direction[2] * ref[2]);
  if (dot > 0.9) {
    ref = [0, 1, 0];
  }

  // Cross product: u = direction x ref
  const u: Vec3 = [
    direction[1] * ref[2] - direction[2] * ref[1],
    direction[2] * ref[0] - direction[0] * ref[2],
    direction[0] * ref[1] - direction[1] * ref[0],
  ];
  const uLen = norm(u);
  const uNorm: Vec3 = scale(u, 1 / uLen) as Vec3;

  // Cross product: v = direction x u
  const v: Vec3 = [
    direction[1] * uNorm[2] - direction[2] * uNorm[1],
    direction[2] * uNorm[0] - direction[0] * uNorm[2],
    direction[0] * uNorm[1] - direction[1] * uNorm[0],
  ];

  return { u: uNorm, v };
}

/**
 * Generate synthetic scan points along a line with Gaussian noise.
 *
 * @param lineP0 First endpoint of the line
 * @param lineP1 Second endpoint of the line
 * @param config Generation configuration
 * @returns Array of synthetic scan points
 */
export function generateSyntheticLinePoints(
  lineP0: Vec3,
  lineP1: Vec3,
  config: Partial<SyntheticLineConfig> = {}
): ScanPoint[] {
  const cfg = { ...DEFAULT_SYNTHETIC_CONFIG, ...config };
  const rng = cfg.seed !== undefined ? createSeededRandom(cfg.seed) : Math.random;

  const points: ScanPoint[] = [];

  // Line direction and length
  const d = sub(lineP1, lineP0);
  const lineLen = norm(d);
  if (lineLen < 1e-9) {
    throw new Error("Degenerate line: p0 and p1 are the same");
  }
  const dNorm = scale(d, 1 / lineLen) as Vec3;

  // Create perpendicular basis
  const { u, v } = createPerpendicularBasis(dNorm);

  // Generate points along the line
  for (let i = 0; i < cfg.num_points; i++) {
    // Parameter along line (0 to 1)
    const t = cfg.num_points > 1 ? i / (cfg.num_points - 1) : 0.5;

    // Base point on line
    const basePoint = add(lineP0, scale(d, t));

    // Add noise along the line direction
    const alongNoise = normalRandom(0, cfg.noise_along_mm, rng);

    // Add noise perpendicular to line (in u and v directions)
    const uNoise = normalRandom(0, cfg.noise_perpendicular_mm, rng);
    const vNoise = normalRandom(0, cfg.noise_perpendicular_mm, rng);

    // Final point with noise
    let point = add(basePoint, scale(dNorm, alongNoise));
    point = add(point, scale(u, uNoise));
    point = add(point, scale(v, vNoise)) as Vec3;

    points.push({ point_mm: point });
  }

  // Add outliers if requested
  if (cfg.add_outliers && cfg.num_outliers) {
    for (let i = 0; i < cfg.num_outliers; i++) {
      // Random position along line
      const t = rng();
      const basePoint = add(lineP0, scale(d, t));

      // Large perpendicular offset (2-5x normal noise)
      const outlierScale = 2 + rng() * 3;
      const uOffset = normalRandom(0, cfg.noise_perpendicular_mm * outlierScale, rng);
      const vOffset = normalRandom(0, cfg.noise_perpendicular_mm * outlierScale, rng);

      let point = add(basePoint, scale(u, uOffset));
      point = add(point, scale(v, vOffset)) as Vec3;

      points.push({ point_mm: point });
    }
  }

  return points;
}

/**
 * Generate a synthetic scan dataset with multiple parts and background noise.
 *
 * @param parts Array of line definitions (p0, p1) for each part
 * @param pointsPerPart Points to generate per part
 * @param noiseStdDev Noise standard deviation (mm)
 * @param backgroundNoise Number of random background points to add
 * @returns Combined point cloud
 */
export function generateSyntheticScan(
  parts: Array<{ p0: Vec3; p1: Vec3 }>,
  pointsPerPart: number = 50,
  noiseStdDev: number = 3,
  backgroundNoise: number = 0
): ScanPoint[] {
  const allPoints: ScanPoint[] = [];

  // Generate points for each part
  for (const part of parts) {
    const partPoints = generateSyntheticLinePoints(part.p0, part.p1, {
      num_points: pointsPerPart,
      noise_perpendicular_mm: noiseStdDev,
      noise_along_mm: noiseStdDev * 0.3,
    });
    allPoints.push(...partPoints);
  }

  // Add background noise if requested
  if (backgroundNoise > 0) {
    // Find bounding box of all parts
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const part of parts) {
      for (const p of [part.p0, part.p1]) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
      }
    }

    // Expand bounding box
    const margin = 100;
    minX -= margin; maxX += margin;
    minY -= margin; maxY += margin;
    minZ -= margin; maxZ += margin;

    // Generate random points in bounding box
    for (let i = 0; i < backgroundNoise; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      const z = minZ + Math.random() * (maxZ - minZ);
      allPoints.push({ point_mm: [x, y, z] });
    }
  }

  return allPoints;
}
