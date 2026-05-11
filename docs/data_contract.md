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

## `toy_facade_v1` — fixture composition

The viewer demo (`datasets/toy_facade_v1/`) ships a 3×3 panel grid (P-01..P-09)
on a 1.55 × 1.05 m pitch, panel size 1500 × 1000 × 50 mm. Each panel declares
three named features in part frame: `J1` (hinge joint at the right edge), `S2`
(lateral slot along panel width, ±10 mm), and `P3` (four-position indexed bolt
pattern about the vertical axis).

Roles by panel:

| Panel | Role     | Deviation                              | Post-apply status |
|-------|----------|----------------------------------------|-------------------|
| P-01  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-02  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-03  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-04  | **mild** | +3.5 mm along S2                       | `pending` → `ok`  |
| P-05  | **hero** | +6.5 mm / −1.0 mm + 3° about P3 axis   | `pending` → `ok`  |
| P-06  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-07  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-08  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |
| P-09  | nominal  | ≤1 mm scan noise                       | `ok` (noop)       |

`pickFocusedPart()` selects P-05 as the hero for beats 2-4 because it has the
largest non-`ok` deviation (~6.6 mm). The remaining 7 panels still appear in
the engine output as `ok`/noop steps; the viewer dims them during beats 2-3
and surfaces all of them in the wide shot at beats 1 and 5.

To regenerate `expected_directives.json` after editing inputs, run:

```sh
node scripts/gen-toy-facade-expected.mjs
```
