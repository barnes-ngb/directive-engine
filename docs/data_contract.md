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

## Optional: named kinematic features (v0.2-additive)

A `PartConstraint` may declare a `features` array of named joints, slots, and
indexed bolt patterns in **part frame** (mm). These are pure presentation
metadata: `generateDirectives` ignores the field, so engine output is
unchanged whether features are present or absent.

```jsonc
"features": [
  { "id": "J1", "kind": "joint", "position_mm": [0,0,0], "axis": [1,0,0],
    "description": "Hinge about part X (CCW from outside face)" },
  { "id": "S2", "kind": "slot",  "position_mm": [0,0,0], "axis": [0,1,0],
    "description": "Vertical mounting slot along part Y" },
  { "id": "I1", "kind": "index", "position_mm": [0,0,0], "axis": [0,0,1],
    "count": 4, "description": "Four-position detent about part Z" }
]
```

The presentation helper `formatDirective(step, constraint?)` in
`src/presentation/format-directive.ts` uses the `features` array to render
installer-language directives:

```
With features:    "Pivot +0.4° about J1 (CCW from outside face).
                   Translate +3.2mm along S2. Status: pending. Tolerance: ±2.0mm."
Without features: "Translate +3.2mm along part-frame Y. Status: pending. ..."
```

Backward compat: `features` is optional throughout. Existing fixtures without
the field validate and produce directives with the part-frame fallback wording.
