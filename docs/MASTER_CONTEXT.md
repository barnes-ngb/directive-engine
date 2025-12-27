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
Use these fixtures for tests and the browser demo (v0.1):
- Nominal poses: `datasets/toy_v0_1/toy_nominal_poses.json`
- As-built poses: `datasets/toy_v0_1/toy_asbuilt_poses.json`
- Constraints: `datasets/toy_v0_1/toy_constraints.json`
- Expected directives: `datasets/toy_v0_1/expected_directives.json`

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

## Change control
Any proposal that changes semantics or schemas must:
1) increment contract version OR clearly state it remains v0.1,
2) update toy dataset + expected output,
3) update tests.
