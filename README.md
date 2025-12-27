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
- `datasets/` — fixture datasets + golden expected outputs
- `site/` — markdown “website bones” (content-only)

## Core API usage (v0.1)
`generateDirectives` is the canonical entry point for producing installer-ready directives.
The v0.1 contract assumes:
- **Units**: millimeters
- **Pose**: `T_world_part` (pose of part frame in world)
- **Rotation**: quaternion `[x, y, z, w]`
- **Statuses**: `ok | pending | clamped | blocked | needs_review`
- **Actions**: `translate | rotate | rotate_to_index | noop`

```ts
import { generateDirectives } from "./src/core/index.js";
import type { NominalPosesDataset, AsBuiltPosesDataset, ConstraintsDataset } from "./src/core/types.js";

const nominal: NominalPosesDataset = /* load datasets/toy_facade_v1/nominal.json */;
const asBuilt: AsBuiltPosesDataset = /* load datasets/toy_facade_v1/as_built.json */;
const constraints: ConstraintsDataset = /* load datasets/toy_facade_v1/constraints.json */;

const directives = generateDirectives(nominal, asBuilt, constraints, {
  inputPaths: {
    nominal: "datasets/toy_facade_v1/nominal.json",
    asBuilt: "datasets/toy_facade_v1/as_built.json",
    constraints: "datasets/toy_facade_v1/constraints.json"
  },
  engineVersion: "directive-engine/0.1.0"
});
```

## Fixture datasets
All fixture data lives under `datasets/`:
- `datasets/toy_facade_v1/` — primary v0.1 reference fixtures.
- `datasets/toy_v0_1/` — additional v0.1 variants for regression checks.

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

## Commands
```bash
npm install
npm test
npm run dev
npm run build
```

## License
Add MIT or Apache-2.0 (or your preference) once you’re ready to publish widely.
