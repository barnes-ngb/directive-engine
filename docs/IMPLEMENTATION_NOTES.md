# Implementation Notes — v0.1 Contract + Toy Fixtures

## Input file shapes & key fields

### Nominal poses (v0.1)
- Schema: `schemas/pose_nominal.schema.json`
- Top-level fields:
  - `schema_version: "v0.1"`
  - `dataset_id`, `frame_id: "world"`
  - `units: { length: "mm", rotation: "quaternion_xyzw" }`
  - `parts[]` with:
    - `part_id`, `part_name`, `part_type`
    - `T_world_part_nominal: { translation_mm: [x,y,z], rotation_quat_xyzw: [x,y,z,w] }`

### As-built poses (v0.1)
- Schema: `schemas/pose_asbuilt.schema.json`
- Top-level fields:
  - `schema_version: "v0.1"`
  - `dataset_id`, `frame_id: "world"`, `measured_at` (ISO 8601)
  - `units: { length: "mm", rotation: "quaternion_xyzw" }`
  - `parts[]` with:
    - `part_id`
    - `T_world_part_asBuilt: { translation_mm, rotation_quat_xyzw }`
    - `pose_confidence` (0..1), optional `confidence_notes`

### Constraints (v0.1)
- Schema: `schemas/constraints.schema.json`
- Top-level fields:
  - `schema_version: "v0.1"`
  - `dataset_id`
  - `engine_config`:
    - `confidence_threshold` (0..1)
    - `translation_clamp_policy` (default `per_axis_max_abs`)
  - `parts[]` with:
    - `part_id`
    - `allowed_translation_axes` (x/y/z booleans)
    - `rotation_mode` (`fixed` | `free` | `index`)
    - `allowed_rotation_axes` (x/y/z booleans)
    - optional `translation_max_abs_mm`, `translation_max_norm_mm`
    - optional `rotation_max_abs_deg`
    - optional `index_rotation` (axis, increment_deg, allowed_indices, nominal_index)
    - `tolerances` (translation_mm, rotation_deg)
    - optional `verification` (method, notes)

### Toy fixture shapes (`datasets/toy_facade_v1/*`)
- These use the legacy contract (aligns with `schemas/as_built.schema.json` and
  `schemas/directives.schema.json`, not the v0.1 `pose_*` + `directives_output` schemas).
- `nominal.json`:
  - `{ job: { jobId, site }, units, parts[] }`
  - `parts[].T_world_part_nominal` uses `{ t: [x,y,z], q: [x,y,z,w] }`
- `as_built.json`:
  - `{ job: { jobId, site }, units, parts[] }`
  - `parts[].T_world_part_asBuilt` uses `{ t, q }`
  - `confidence` (0..1), optional `source`
- `constraints.json`:
  - `{ jobId, defaults, parts }`
  - `defaults`: `toleranceMm`, `confidenceThreshold`
  - `parts[partId]`:
    - `allowedTranslations.axes` (array of axis strings), `allowedTranslations.maxMm`
    - `allowedRotation` (type `none` | `index`, axis, stepDegrees, allowedIndices)
    - `tolerances` (translationMm, rotationDeg)
    - `notes` (string[])

## Output shape (directives) + status/action/verification

### Directives output (v0.1)
- Schema: `schemas/directives_output.schema.json`
- Top-level fields:
  - `schema_version: "v0.1"`
  - `dataset_id`, `engine_version`, `generated_at`
  - `inputs`: input file paths + `confidence_threshold`
  - `summary.counts_by_status`: `ok | pending | clamped | blocked | needs_review`
  - `steps[]` with:
    - `status` (enum above)
    - `reason_codes[]`
    - `pose_confidence` (optional)
    - `computed_errors`:
      - `translation_error_mm_vec` (Vec3)
      - `translation_error_norm_mm`
      - `rotation_error_deg`
    - `actions[]`:
      - `type`: `translate | rotate | rotate_to_index | noop`
      - `description`, `action_id`
      - `delta` for non-noop (`translation_mm`, `rotation_quat_xyzw`)
      - `axis` for rotations, `target_index` for rotate_to_index
      - `clamp_applied` + `original_delta` when clamping occurs
    - `verification[]`:
      - `type`: `measure_pose | re_scan | manual_inspection`
      - `acceptance` (translation_mm, rotation_deg)
      - `expected_residual` (translation_mm_vec, rotation_deg)
      - `expected_result`: `expected_pass | expected_fail | unknown`

### Toy fixture output (`datasets/toy_facade_v1/expected_directives.json`)
- Legacy output shape:
  - `{ jobId, generatedAt, metrics, steps[] }`
  - `metrics` contains `beforeMaxDeviationMm`, `afterMaxDeviationMm`
  - Each step has:
    - `stepId`, `partId`, `priority`, `status`
    - `actions[]`: `translate` or `rotate_index` with `frame`, `vectorMm`, `axis`, `index`
    - `verification`: `type` (`measure` | `rescan`), `passIfMaxDeviationMm`
    - `notes[]`

## Frame + units assumptions
- Frame: `world` is the only frame used in v0.1 outputs.
- Pose meaning: `T_world_part` (pose of part frame in world).
- Units: translation in **mm**, rotations in quaternion `[x,y,z,w]` (v0.1).
- Legacy toy fixture uses `{ t, q }` with the same units.

## Confidence gating rules
- v0.1 engine config: `constraints.engine_config.confidence_threshold`.
  - If `pose_confidence < threshold`: status `needs_review` with a `noop` action and
    verification `expected_result = unknown` (no motion action).
- Legacy toy fixture uses `constraints.defaults.confidenceThreshold`.

## Rounding requirements / determinism
- No explicit rounding in v0.1 outputs; comparisons use small epsilons (`1e-9`/`1e-12`).
- Output ordering is deterministic by nominal parts order and sequential action/verification IDs.

## Node-only vs browser-safe boundaries

### Node-only APIs currently used
- `src/cli/index.ts`: `node:fs/promises`, `node:path`, `process`
- `src/test/golden.ts`: `node:fs/promises`, `node:assert/strict`, `process`
- `src/test/renderHelpers.ts`: `node:assert/strict`

### Browser-safe core
- `src/core/**` and `src/math/**` are pure computation (no Node APIs).
- `src/web/**` uses browser APIs (`fetch`, DOM).

### Recommended placement
- Keep Node-specific I/O in `src/cli/**` and `src/test/**` (or `scripts/**`).
- Keep `src/core/**` free of Node APIs to preserve browser bundle compatibility.
