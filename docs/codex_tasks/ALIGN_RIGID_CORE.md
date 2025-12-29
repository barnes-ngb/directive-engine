Codex: Anchor-based rigid alignment as a browser-safe core module

Copy/paste this into something like: docs/codex_tasks/ALIGN_RIGID_CORE.md

Task ID

ALIGN-RIGID-CORE

Title

Anchor-based rigid alignment (browser-safe core)

Goal

Implement a deterministic, browser-safe rigid alignment core module that computes the best-fit rigid transform between corresponding anchor points in scan and model frames, plus residual reporting.

Non-goals

No changes to directive contract semantics (schemas, dataset contract interpretation, directive evaluation logic).

No dependency on Node-only APIs or native numeric libraries.

No ICP / closest-point matching (anchors are assumed corresponded by ID).

Inputs and outputs
Input

Two arrays:

scanPts: { anchor_id: string; point_mm: [x,y,z] }[]

modelPts: { anchor_id: string; point_mm: [x,y,z] }[]

Correspondences are determined by anchor_id equality.

Output

computeRigidTransform(scanPts, modelPts) => {

T_model_scan: { translation_mm: Vec3; rotation_quat_xyzw: Quat }

rms_mm: number

residuals_mm: { anchor_id; residual_mm; residual_vec_mm }[]
}

Frame convention:
p_scan ≈ R(model→scan) * p_model + t(model→scan)

Residual convention:

residual_vec_mm = scan_point - (R*model_point + t)

residual_mm = ||residual_vec_mm||

rms_mm = sqrt(mean(residual_mm^2))

Units:

translation in millimeters

quaternion in [x,y,z,w]

Deliverables
1) src/core/align/rigid.ts

Exports:

computeRigidTransform(scanPts, modelPts): RigidTransformResult

Implementation notes:

Build correspondence set by anchor_id intersection.

Require N >= 3 correspondences; otherwise throw a clear error.

Compute centroids of both point sets.

Compute covariance matrix H = Σ (model_i - c_model) ⊗ (scan_i - c_scan)^T

Compute rotation R using Horn quaternion method:

Build Horn 4×4 symmetric matrix N(H)

Extract principal eigenvector → quaternion

Convert quaternion to rotation matrix

Compute translation t = c_scan - R*c_model

Compute per-anchor residuals and RMS.

Optional robustness (explicitly opt-in only if desired):

If implementing outlier robustness (RANSAC/trimmed sets), codex must specify:

scoring

how outliers are detected

deterministic behavior (no randomness or seeded RNG)

2) src/core/align/apply.ts

Exports:

applyTransformToPoint(T, p)

applyTransformToLine(T, line)

Implementation notes:

Convert quaternion to rotation matrix once per call (or use helper).

Point: p' = R*p + t

Line: apply to start and end

3) Node-run tests (import only src/core/**)

Create tests that:

Synthetic known transform recovery

Generate 4+ non-coplanar model points.

Apply known T_true to get scan points.

Run computeRigidTransform(scan, model)

Verify:

predicted scan points match within epsilon

rms_mm near 0

residuals near 0

Residual calculation

Create scan/model correspondences with a small perturbation (noise) applied to one scan anchor.

Run computeRigidTransform.

Independently recompute:

residual vectors from returned T_model_scan

residual magnitudes

RMS

Assert that returned residuals_mm and rms_mm match those recomputed values (within epsilon).

Acceptance criteria checklist

 computeRigidTransform produces correct T_model_scan mapping model→scan

 Quaternion output is normalized (or close enough within numeric tolerance)

 Residual vector definition matches contract and is consistent with T_model_scan

 Browser-safe: no Node imports, no fs/path, no crypto, no native deps

 Tests run in Node and import only from src/core/**

 No directive contract semantics changed

Edge cases to cover

Too few correspondences (<3) → throw

Unmatched anchor IDs → ignored (or explicit error if configured; pick one approach and document it)

Duplicate anchor IDs in an input list → define behavior (throw vs last wins)

Degenerate geometry (collinear points) → rotation ill-defined; either throw or return best-effort with warning (codex should specify)

Implementation plan

Create src/core/align/rigid.ts

Types: Vec3, Quat, Transform, AnchorPoint, result types

Helpers: centroid, dot/norm, matrix-vector multiply, quaternion conversions

Implement Horn rotation-from-covariance

Start with power iteration (fast/simple)

(Optional hardening) swap to Jacobi symmetric eigen solver if needed

Add residual + RMS computation

Create src/core/align/apply.ts

Add Node-run tests per above

Verify no contract semantics changes
