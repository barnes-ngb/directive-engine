# toy_facade_v1

Tiny synthetic dataset that drives the directive-engine viewer demo. The
viewer reads the three JSONs below on mount, maps them to the engine's v0.1
schema via `src/viewer/engine-bridge.ts`, and runs `generateDirectives()`
once per session.

## Files

- `nominal.json` — `T_world_part_nominal` for each panel.
- `as_built.json` — `T_world_part_asBuilt` for each panel, plus a scan
  `confidence` score.
- `constraints.json` — allowed DOF (translations / index rotation),
  tolerances, and named features (`J1` joint, `S2` slot, `P3` index pattern).
- `expected_directives.json` — concise reference of the engine's output for
  this fixture. **Generated**, not hand-edited. Regenerate after edits to the
  inputs by running:

  ```sh
  node scripts/gen-toy-facade-expected.mjs
  ```

## Design

The fixture is a 3×3 facade subsection — nine panels (`P-01` … `P-09`) on a
1.55 × 1.05 m pitch (1500 × 1000 × 50 mm panels with ~50 mm reveal gaps).
The grid is laid out in the world XY plane (Y up in the viewer scene); rows
top-to-bottom are y = +1050, 0, −1050; columns left-to-right are
x = −1550, 0, +1550.

Each panel declares three features in part frame:

- **`J1`** — joint at the panel's right edge (hinge pivot about +Y).
- **`S2`** — slot along the panel's width (±10 mm along part X).
- **`P3`** — four-position indexed bolt pattern about +Y (the locking bolt).

The deviation distribution is deliberate:

| Panel | Role     | Deviation                            |
|-------|----------|--------------------------------------|
| P-01  | nominal  | sub-1 mm scan noise                  |
| P-02  | nominal  | sub-1 mm scan noise                  |
| P-03  | nominal  | sub-1 mm scan noise                  |
| P-04  | **mild** | +3.5 mm along S2 (pure translation)  |
| P-05  | **hero** | +6.5 / −1.0 mm + 3° about P3         |
| P-06  | nominal  | sub-1 mm scan noise                  |
| P-07  | nominal  | sub-1 mm scan noise                  |
| P-08  | nominal  | sub-1 mm scan noise                  |
| P-09  | nominal  | sub-1 mm scan noise                  |

P-05 is the **hero** panel that beats 2-4 focus on; `pickFocusedPart()`
selects it because it has the largest non-`ok` deviation. P-04 reads as
context — "the engine also generates directives for these smaller
deviations, the demo just centers on one." The remaining seven panels read
as a populated facade where most work is already correct, so the deviations
that do exist stand out.

The previous 2-panel fixture left the scene feeling sparse; this version
gives the wide shot something to anchor on (see Phase 2 retrospective +
Phase 6 brief in `docs/`).

## What is **not** here

- No clamped or blocked panel. The engine's clamp behavior is exercised
  separately by the museum/scan integration tests; the demo prioritizes a
  clean before/after read. (Phase 6 surfaced this as an open decision —
  current call is to skip the clamped panel until the demo script wants the
  honesty signal more than the clean read.)

## Schema note

This fixture uses a compact legacy shape (`{ t: [...], q: [...] }`) that
differs from the v0.1 contract's full schema. The viewer's
`engine-bridge.ts` maps it into `NominalPosesDataset` /
`AsBuiltPosesDataset` / `ConstraintsDataset` before calling the engine.
`scripts/validate-datasets.mjs` skips this directory for that reason.
