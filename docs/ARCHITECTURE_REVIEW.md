# Architecture Review: Directive Engine

**Review Date:** 2026-01-02
**Branch:** `claude/review-architecture-Fz40x`
**Reviewer:** Claude (Architecture Analysis)

---

## Executive Summary

The Directive Engine is a well-structured, contracts-first TypeScript project that converts as-built deviations into field-executable directives. The architecture demonstrates solid design principles with clear separation of concerns, comprehensive type safety, and good test coverage. However, there are several critical issues, functional bugs, and enhancement opportunities that should be addressed.

### Overall Assessment

| Category | Rating | Notes |
|----------|--------|-------|
| Architecture | ★★★★☆ | Clean separation, contracts-first design |
| Code Quality | ★★★★☆ | TypeScript strict mode, clear structure |
| Test Coverage | ★★★☆☆ | Good coverage but 2 failing tests |
| Documentation | ★★★★☆ | Comprehensive docs, clear contracts |
| Maintainability | ★★★★☆ | Modular, portable across languages |

---

## 1. Architecture Overview

### 1.1 Project Structure

```
directive-engine/
├── src/
│   ├── core/           # Pure computation engine (browser-safe)
│   │   ├── align/      # Rigid transform & alignment
│   │   ├── convert/    # Data format conversion
│   │   ├── math/       # Vector/quaternion operations
│   │   ├── generateDirectives.ts  # Main algorithm
│   │   └── types.ts    # Core type definitions
│   ├── cli/            # Node.js CLI interface
│   └── __tests__/      # Unit tests
├── demo/               # Web-based demo application
├── schemas/            # JSON Schema contracts (v0.1)
├── datasets/           # Fixture datasets for testing
├── docs/               # Documentation
└── scripts/            # Build utilities
```

### 1.2 Core Design Principles

1. **Contracts-First**: JSON Schemas define all I/O boundaries, enabling language-agnostic implementations
2. **Browser-Safe Core**: `src/core/` contains no Node.js dependencies, enabling web bundling
3. **Deterministic Computation**: No randomness, sequential ordering, epsilon-based comparisons
4. **Separation of Concerns**: Pure math ↔ business logic ↔ I/O layers

### 1.3 Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Nominal Poses   │────▶│                  │────▶│ Directive Steps │
├─────────────────┤     │  generateDirectives() │     ├─────────────────┤
│ As-Built Poses  │────▶│                  │────▶│ Actions         │
├─────────────────┤     │  (core engine)   │────▶│ Verification    │
│ Constraints     │────▶│                  │────▶│ Summary         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 2. Critical Issues

### 2.1 🔴 Failing Unit Tests (CRITICAL)

**Location:** `src/__tests__/align.rigid.test.ts:28-55, 105-156`

Two tests are failing in the rigid alignment module:

```
FAIL: "recovers a known rigid transform"
  Expected -1.4999986975326287 ~ 1

FAIL: "sorts residuals by magnitude when computing alignment quality"
  Expected -0.3220955361953308 ~ 0
```

**Root Cause Analysis:**

The Horn quaternion method implementation in `src/core/align/rigid.ts:53-112` uses power iteration (200 iterations) to find the dominant eigenvector. The issue appears to be in how the transform direction is computed:

```typescript
// rigid.ts:108-109 - Potential issue area
const rotatedScan = rotateVec3ByQuat(scanCentroid, rotation_quat_xyzw);
const translation_mm = sub(modelCentroid, rotatedScan);
```

The tests expect `T_model_scan` to map scan points to model points, but the computed translation may have incorrect sign or rotation direction.

**Impact:** The rigid alignment function is used by the Museum dataset pipeline. Incorrect alignment leads to incorrect directive generation for real-world scenarios.

**Recommendation:** Fix the Horn method implementation or verify the test expectations match the intended transform convention.

---

### 2.2 🟠 Rotation Clamping Not Implemented (MEDIUM)

**Location:** `src/core/generateDirectives.ts:314-352`

While translation clamping is fully implemented with per-axis limits, rotation clamping is not:

```typescript
// Line 332-341: Free rotation mode doesn't apply rotation_max_abs_deg
if (c.rotation_mode === "free") {
  const axis = dominantAxis(c.allowed_rotation_axes, rAxis) ?? ...;
  actions.push({
    action_id: `A${actionCounter++}`,
    type: "rotate",
    ...
    clamp_applied: false  // Always false - no clamping logic
  });
```

The `rotation_max_abs_deg` constraint in `types.ts:67` is defined but never used.

**Impact:** Large rotation corrections could exceed mechanical limits without warning.

**Recommendation:** Implement rotation clamping similar to translation clamping logic.

---

### 2.3 🟠 Missing Input Validation (MEDIUM)

**Location:** `src/core/generateDirectives.ts:101-106`

The main entry point does not validate inputs against schemas:

```typescript
export function generateDirectives({
  nominal,
  asBuilt,
  constraints,
  options = {}
}: GenerateDirectivesInput): DirectivesOutput {
  // No validation - trusts input structure completely
```

**Issues:**
- No schema version checking
- No quaternion normalization verification
- No confidence range validation (should be 0-1)
- No duplicate part_id detection

**Impact:** Invalid inputs could cause subtle bugs or incorrect directives.

**Recommendation:** Add input validation layer with clear error messages.

---

### 2.4 🟡 Incomplete Error Handling in Demo (LOW-MEDIUM)

**Location:** `demo/main.ts:99-124`

The `runGenerateDirectives` function has unusual error handling:

```typescript
try {
  const positionalResult = engine(nominal, asBuilt, constraints, {
    inputPaths: {...}
  });
  return await Promise.resolve(positionalResult as DirectivesOutput);
} catch (error) {
  // Falls back to object-style call on ANY error
  const objectResult = engine({...});
}
```

This catches all errors and tries a different calling convention, which could mask real bugs.

**Recommendation:** Remove this fallback or add proper error discrimination.

---

## 3. Functional Analysis

### 3.1 Core Algorithm Correctness

The `generateDirectives` function at `src/core/generateDirectives.ts:101-403` correctly implements:

✅ Confidence gating (`pose_confidence < threshold` → `needs_review`)
✅ Tolerance checking (within tolerance → `ok` status)
✅ Translation masking by allowed axes
✅ Per-axis translation clamping with original delta preservation
✅ Block conditions for exceeding max norm
✅ Index rotation quantization
✅ Sequential step/action/verification ID generation
✅ Status-appropriate verification expected results

### 3.2 Mathematical Operations

**Vector Operations** (`src/core/math/vec.ts`): ✅ Correct
- `sub`, `add`, `scale`, `norm`, `clampVecPerAxis` all correctly implemented

**Quaternion Operations** (`src/core/math/quat.ts`): ✅ Mostly Correct
- Hamilton product convention used consistently
- Unit quaternion assumption for `inverse` (conjugate only)
- `toAxisAngle` handles w < 0 case correctly

**Transform Operations** (`src/core/align/apply.ts`): ✅ Correct
- Rotation-then-translation order
- Proper inverse computation
- Composition follows expected order (first, then second)

### 3.3 Data Type Coverage

The type system at `src/core/types.ts:1-144` is well-designed:

✅ Discriminated unions for action types
✅ Strict Vec3/Quat tuple types
✅ Comprehensive constraint modeling
✅ All status codes properly enumerated

---

## 4. Enhancement Opportunities

### 4.1 🚀 Add Runtime Schema Validation

**Priority:** High
**Effort:** Medium

Create a validation layer using the existing JSON schemas:

```typescript
// Proposed: src/core/validate.ts
import Ajv from "ajv";
import nominalSchema from "../../schemas/pose_nominal.schema.json";

export function validateNominalPoses(data: unknown): NominalPosesDataset {
  const ajv = new Ajv();
  const validate = ajv.compile(nominalSchema);
  if (!validate(data)) {
    throw new ValidationError(validate.errors);
  }
  return data as NominalPosesDataset;
}
```

**Benefits:**
- Catch schema mismatches early
- Clear error messages for integrators
- Prevents runtime surprises

---

### 4.2 🚀 Implement Rotation Clamping

**Priority:** High
**Effort:** Low

```typescript
// In generateDirectives.ts, after line 340
if (c.rotation_max_abs_deg) {
  const maxDeg = c.rotation_max_abs_deg[axis];
  if (rErrDeg > maxDeg) {
    clampApplied = true;
    // Clamp rotation quaternion to max angle
    residualRotationDeg = rErrDeg - maxDeg;
    reason_codes.push("rotation_clamped");
  }
}
```

---

### 4.3 🔧 Add Batch Processing Mode

**Priority:** Medium
**Effort:** Medium

The CLI currently processes one dataset at a time. For production use:

```typescript
// Proposed: src/cli/batch.ts
interface BatchConfig {
  jobs: Array<{
    nominal: string;
    asBuilt: string;
    constraints: string;
    output: string;
  }>;
  parallelism?: number;
}
```

---

### 4.4 🔧 Add Directive Execution Simulation

**Priority:** Medium
**Effort:** High

Add post-directive verification simulation:

```typescript
// Proposed: src/core/simulate.ts
export function simulateDirectiveExecution(
  asBuilt: AsBuiltPosesDataset,
  directives: DirectivesOutput
): SimulatedPosesDataset {
  // Apply each action's delta to as-built poses
  // Return predicted post-correction poses
}
```

This would enable:
- Pre-execution validation
- "What-if" analysis
- Verification rule testing

---

### 4.5 🔧 Improve Rigid Alignment Robustness

**Priority:** High
**Effort:** Medium

The current power iteration method (200 fixed iterations) could be improved:

```typescript
// Current: rigid.ts:102-104
for (let i = 0; i < 200; i++) {
  quatVector = normalizeVector(multiplyMatrixVector(nMatrix, quatVector));
}

// Proposed: Add convergence check
let prevVector = quatVector;
for (let i = 0; i < maxIterations; i++) {
  quatVector = normalizeVector(multiplyMatrixVector(nMatrix, quatVector));
  if (vectorsConverged(quatVector, prevVector, tolerance)) break;
  prevVector = quatVector;
}
```

Also consider using SVD-based alignment for improved numerical stability.

---

### 4.6 🎨 Add Logging/Tracing Infrastructure

**Priority:** Low
**Effort:** Low

Add optional tracing for debugging:

```typescript
// Proposed: src/core/trace.ts
export interface TraceContext {
  onStepStart?(partId: string): void;
  onActionGenerated?(action: Action): void;
  onClampApplied?(original: Vec3, clamped: Vec3): void;
}
```

---

### 4.7 📊 Add Metrics/Analytics Export

**Priority:** Low
**Effort:** Medium

Extend `DirectivesOutput.summary` with richer metrics:

```typescript
summary: {
  counts_by_status: Record<Status, number>;
  // Proposed additions:
  total_translation_correction_mm: number;
  avg_rotation_correction_deg: number;
  max_residual_mm: number;
  processing_time_ms?: number;
}
```

---

## 5. Test Coverage Analysis

### 5.1 Current Coverage

| Module | Test File | Coverage |
|--------|-----------|----------|
| generateDirectives | `golden.test.ts`, `contract.*.test.ts` | ✅ Good |
| align/rigid | `align.rigid.test.ts` | ❌ 2 failing |
| align/apply | `applyTransform.test.ts` | ✅ Good |
| math/vec, math/quat | (indirect via other tests) | 🟡 Indirect only |
| demo/museum | `museum.test.ts`, `museum.pipeline.test.ts` | ✅ Good |
| demo/summary | `summary.test.ts` | ✅ Good |

### 5.2 Missing Test Coverage

1. **Edge Cases in generateDirectives:**
   - Part with all DOF locked (`fixed` rotation, no translation axes)
   - Multiple actions per step (translate + rotate)
   - Empty parts arrays

2. **Math Module Direct Tests:**
   - Quaternion edge cases (near-identity, near-180°)
   - Vector normalization of zero vector

3. **Error Paths:**
   - Invalid schema versions
   - Malformed quaternions
   - Negative confidence values

---

## 6. Security Considerations

### 6.1 No Major Vulnerabilities

The codebase handles structured JSON data with no:
- External command execution
- File path manipulation from user input
- Network requests in core engine
- Eval or dynamic code execution

### 6.2 Minor Recommendations

1. **NPM Audit**: 5 moderate vulnerabilities reported - run `npm audit fix`
2. **Input Bounds**: Add numeric range validation for all input fields
3. **Schema Pinning**: Consider strict schema version enforcement

---

## 7. Performance Considerations

### 7.1 Current Performance Characteristics

- **Time Complexity**: O(n) where n = number of parts
- **Space Complexity**: O(n) for output generation
- **Horn Alignment**: O(m × 200) where m = anchor count (fixed iteration)

### 7.2 Potential Bottlenecks

1. **Large Part Counts**: No streaming/chunking for very large datasets
2. **Power Iteration**: Fixed 200 iterations even for trivial cases
3. **Map Lookups**: O(1) but creates intermediate Maps for each call

### 7.3 Recommendations

For datasets > 10,000 parts:
- Consider streaming JSON parsing
- Add progress callbacks for long-running operations
- Cache compiled schemas for repeated validation

---

## 8. API Design Review

### 8.1 Strengths

✅ Clear input/output contracts via JSON Schema
✅ Single entry point (`generateDirectives`)
✅ Immutable input handling
✅ Comprehensive output structure

### 8.2 Improvement Opportunities

1. **Options Pattern**: Consider builder pattern for complex options
2. **Async Support**: Add async version for large datasets
3. **Partial Processing**: Allow processing subset of parts

```typescript
// Proposed API extension
export interface GenerateDirectivesOptions {
  // Existing
  inputPaths?: { nominal: string; asBuilt: string; constraints: string };
  engineVersion?: string;
  generatedAt?: string;

  // Proposed additions
  partFilter?: (partId: string) => boolean;
  onProgress?: (processed: number, total: number) => void;
  abortSignal?: AbortSignal;
}
```

---

## 9. Recommendations Summary

### Immediate Actions (This Sprint)

| Priority | Issue | Action |
|----------|-------|--------|
| 🔴 Critical | Failing rigid alignment tests | Fix transform computation or test expectations |
| 🔴 Critical | NPM vulnerabilities | Run `npm audit fix` |
| 🟠 High | No input validation | Add schema validation layer |

### Near-Term Improvements

| Priority | Enhancement | Effort |
|----------|-------------|--------|
| 🟠 High | Rotation clamping | Low |
| 🟠 High | Improved alignment convergence | Medium |
| 🟡 Medium | Direct math module tests | Low |
| 🟡 Medium | Batch processing CLI | Medium |

### Future Considerations

| Priority | Enhancement | Effort |
|----------|-------------|--------|
| 🔵 Low | Directive simulation | High |
| 🔵 Low | Logging infrastructure | Low |
| 🔵 Low | Extended metrics | Medium |

---

## 10. Conclusion

The Directive Engine demonstrates solid architectural foundations with a contracts-first approach that enables multi-language implementation. The core algorithm is well-designed and handles the primary use cases correctly.

**Key Strengths:**
- Clean separation between pure computation and I/O
- Comprehensive type system with strict TypeScript
- Good test coverage for happy paths
- Well-documented data contracts

**Key Risks:**
- Failing rigid alignment tests indicate a potential bug in a critical path
- Missing input validation could lead to subtle failures
- Rotation clamping gap could cause field issues

**Overall Recommendation:** Address the critical issues (failing tests, validation) before production use. The architecture is sound and the codebase is maintainable for future enhancements.

---

*This review was generated by analyzing the codebase structure, reading core implementation files, running the test suite, and evaluating against software engineering best practices.*
