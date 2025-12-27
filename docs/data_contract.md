# Directive Engine v0.1 — Data Contract (Public-Safe)

This repo is a runnable reference implementation of the v0.1 contract:
inputs → processing → outputs → verification.

The intent is to treat the toy dataset like a **calibration fixture**:
if you feed the same inputs to the engine, you should get the same (or numerically-equivalent) outputs.

## Frames
- `world`: global reference frame
- `part`: part-local frame (not used explicitly in v0.1 outputs; everything is world-frame deltas)

## Pose fields
- `translation_mm`: `[x,y,z]` mm
- `rotation_quat_xyzw`: quaternion `[x,y,z,w]`

Poses are represented as `T_world_part` (pose of the part frame in world).

## Minimal processing
For each part:
- translation error: `t_err = t_nominal - t_asBuilt`
- rotation error: `q_err = q_nominal ⊗ inverse(q_asBuilt)`
- apply constraints:
  - confidence gate → needs_review
  - within tolerance → ok/noop
  - outside max norm → blocked
  - else generate translate/rotate actions (with clamping + indexing)

## Notes about "golden" files
The provided `data/expected_directives.json` includes human-readable strings.
The test harness in `src/test/golden.ts` verifies **machine-relevant fields**
and ignores text/notes so you don’t get stuck matching phrasing.
