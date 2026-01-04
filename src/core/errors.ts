/**
 * Domain-specific error types for the directive engine.
 *
 * These errors provide context about what went wrong and where,
 * enabling better error handling and debugging.
 */

/**
 * Base error class for all directive engine errors.
 */
export class DirectiveEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectiveEngineError";
  }
}

/**
 * Error thrown when input validation fails.
 * Contains an array of all validation errors found.
 */
export class ValidationError extends DirectiveEngineError {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join("; ")}`);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/**
 * Error thrown when rigid alignment computation fails.
 */
export class RigidAlignmentError extends DirectiveEngineError {
  readonly anchorCount?: number;
  readonly reason: "insufficient_anchors" | "degenerate_geometry" | "convergence_failed";

  constructor(
    message: string,
    reason: RigidAlignmentError["reason"],
    anchorCount?: number
  ) {
    super(message);
    this.name = "RigidAlignmentError";
    this.reason = reason;
    this.anchorCount = anchorCount;
  }
}

/**
 * Error thrown when constraint validation or application fails.
 */
export class ConstraintViolationError extends DirectiveEngineError {
  readonly partId: string;
  readonly constraintType: "translation" | "rotation" | "index_rotation" | "confidence";

  constructor(
    message: string,
    partId: string,
    constraintType: ConstraintViolationError["constraintType"]
  ) {
    super(message);
    this.name = "ConstraintViolationError";
    this.partId = partId;
    this.constraintType = constraintType;
  }
}

/**
 * Error thrown when processing a specific part fails.
 */
export class PartProcessingError extends DirectiveEngineError {
  readonly partId: string;
  readonly stepId?: string;

  constructor(message: string, partId: string, stepId?: string) {
    super(message);
    this.name = "PartProcessingError";
    this.partId = partId;
    this.stepId = stepId;
  }
}

/**
 * Error thrown when timestamp parsing or manipulation fails.
 */
export class TimestampError extends DirectiveEngineError {
  readonly invalidValue: string;

  constructor(message: string, invalidValue: string) {
    super(message);
    this.name = "TimestampError";
    this.invalidValue = invalidValue;
  }
}
