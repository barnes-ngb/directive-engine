# Directive Engine (Starter Kit)
**As-built deltas → installer-ready directives** (move / rotate / index) with visualization + verification.

This repo is a **contracts-first** scaffold for the project:
- You can implement the engine in **Python, C#, or TypeScript** (or mix).
- You can implement the viewer in any web stack you like.

## What this solves
When reality capture shows deviations, teams still need **field-executable instructions**:
- what to move (and in which frame),
- how much,
- what’s allowed (constraints),
- and how to verify closure.

## What’s included
- `docs/` — overview, demo script, data contract
- `schemas/` — JSON Schemas for inputs/outputs
- `datasets/` — toy dataset + golden expected output
- `site/` — markdown “website bones” (content-only)

## Quickstart (high-level)
1. Start by validating the dataset schemas:
   - `datasets/toy_facade_v1/as_built.json` against `schemas/as_built.schema.json`
   - `datasets/toy_facade_v1/constraints.json` against `schemas/constraints.schema.json`
   - (optional) `datasets/toy_facade_v1/nominal.json` against the nominal schema you choose (see docs)

2. Implement the core loop:
   - load nominal + as-built
   - compute correction deltas
   - project onto constraints (allowed DOF)
   - quantize indexed rotations
   - emit directives JSON

3. Compare output to golden file:
   - `datasets/toy_facade_v1/expected_directives.json`

4. Build a minimal viewer:
   - list parts
   - show directive card
   - visualize correction gizmo
   - simulate apply + show before/after metric

## License
Add MIT or Apache-2.0 (or your preference) once you’re ready to publish widely.
