/**
 * Centralized numerical constants for the directive engine.
 *
 * These epsilon values are used throughout the codebase for numerical
 * comparisons and floating point tolerance checks.
 */

/**
 * General purpose epsilon for small numerical comparisons.
 * Used in generateDirectives for tolerance boundary checks.
 */
export const EPS = 1e-9;

/**
 * Epsilon for tolerance comparisons (translation_mm, rotation_deg).
 * Slightly larger than EPS to account for accumulated floating point errors.
 */
export const EPS_TOLERANCE = 1e-12;

/**
 * Tolerance for quaternion normalization checks.
 * A quaternion is considered normalized if |norm - 1| <= this value.
 */
export const EPS_QUAT_NORM = 0.01;

/**
 * Epsilon for detecting degenerate axis vectors (near-zero length).
 * Used in axis-angle conversion when sin(half_angle) is too small.
 */
export const EPS_AXIS_DEGENERATE = 1e-8;

/**
 * Epsilon for detecting zero-length vectors in normalization.
 * Used in fromAxisAngle to detect degenerate input axes.
 */
export const EPS_VECTOR_NORM = 1e-12;

/**
 * Default maximum iterations for power iteration in rigid alignment.
 */
export const POWER_ITERATION_MAX_ITERS = 200;

/**
 * Convergence threshold for power iteration eigenvector computation.
 * Iteration stops when the change in eigenvector norm is below this value.
 */
export const POWER_ITERATION_CONVERGENCE = 1e-10;
