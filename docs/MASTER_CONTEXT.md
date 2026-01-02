# Directive Engine — Master Context

## Goal
Browser-first “Installer Directive Center”:
Input (nominal + as-built + constraints) → directives (actions + status) → verification expectation.
Runs in browser so it can be deployed to any device as a static web app.

## Repo structure (current)
- datasets/        # datasets used by tests + demo
- schemas/         # JSON schemas
- src/             # engine + web demo code
- site/            # (optional) docs/marketing; keep minimal

## Canonical fixtures
Two toy fixture sets coexist, each aligned to a different schema/version:

**v0.1 schema fixtures (canonical for v0.1 tests/demo):**
- Nominal poses: `datasets/toy_v0_1/toy_nominal_poses.json`
- As-built poses: `datasets/toy_v0_1/toy_asbuilt_poses.json`
- Constraints: `datasets/toy_v0_1/toy_constraints.json`
- Expected directives: `datasets/toy_v0_1/expected_directives.json`

**Legacy facade fixtures (toy_facade_v1):**
- Nominal poses: `datasets/toy_facade_v1/nominal.json`
- As-built poses: `datasets/toy_facade_v1/as_built.json`
- Constraints: `datasets/toy_facade_v1/constraints.json`
- Expected directives: `datasets/toy_facade_v1/expected_directives.json`

Use the v0.1 schema fixtures when validating `schemas/*` v0.1 expectations, and use
`toy_facade_v1` only for legacy/facade compatibility checks.

Note: There is no `data/` directory in this repo; use `datasets/` instead.

## Canonical contract (v0.1)
- Units: mm
- Rotation: quaternion [x,y,z,w]
- Pose meaning: T_world_part (pose of part frame in world)
- Statuses: ok | pending | clamped | blocked | needs_review
- Actions: translate | rotate | rotate_to_index | noop
- Confidence gate: if pose_confidence < threshold → needs_review and no motion action

## Deterministic rules
- t_err = t_nominal - t_asBuilt  (world frame)
- q_err = q_nominal ⊗ inverse(q_asBuilt)
- within tolerance → ok + noop
- clamp translation per constraints
- blocked if exceeds max norm (if defined)
- index rotation snaps to nominal_index (v0.1) unless changed via proposal

## Non-goals (for now)
- full scan registration from raw point clouds
- perfect rotation decomposition per-axis
- AR UI

## Demo UI Features

### Apply Simulation Panel
The demo UI includes an "Apply Simulation" panel that allows interactive testing of directive application:

**Location:** `demo/` directory, panel appears in the main demo layout

**Features:**
- **Before Error:** Shows translation vector + norm (mm) and rotation error (deg) before applying directive
- **Directive Delta:** Shows the translation and rotation corrections that will be applied
- **Simulate Apply button:** Click to simulate applying the directive and see results
- **After Error:** Shows resulting translation + norm and rotation error after simulated application
- **PASS/FAIL badge:** Green PASS if within tolerances, red FAIL if still out of tolerance

**Behavior:**
- Button is disabled (shows "N/A") when status is `blocked` or `needs_review`
- Works with both Toy and Museum datasets
- Results are cached per-part during a session; click "Re-simulate" to recompute

**Core API:**
```typescript
import { simulateStep } from "./src/core/index.js";

const result = simulateStep({
  nominalPose: { translation_mm: [...], rotation_quat_xyzw: [...] },
  asBuiltPose: { translation_mm: [...], rotation_quat_xyzw: [...] },
  step: directiveStep,
  tolerances: { translation_mm: 1, rotation_deg: 1 }
});
// result: { beforeError, directiveDelta, afterError, pass, canSimulate }
```

## Change control
Any proposal that changes semantics or schemas must:
1) increment contract version OR clearly state it remains v0.1,
2) update toy dataset + expected output,
3) update tests.
