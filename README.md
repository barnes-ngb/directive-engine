# Directive Engine

**As-built reality → installer-ready directives.** A v0.2 demo for translating geometric deviation into field-executable action, with DOF-aware constraints and pass/fail verification.

**Live demo:** https://directive-engine.vercel.app
**Write-up:** https://systemsforge.build/writing/pixels-to-atoms/
**Case study:** https://systemsforge.build/work/directive-engine/

MIT-licensed. Runs in a browser. 187 unit tests passing.

## The problem

Capture tells you where reality is. It doesn’t tell you what to do about it.

A scan says the wall is 8mm off. A deviation map says the panel is rotated 1.4° from nominal. Neither says: *translate −6.5mm along slot S2, rotate to index 0 on P3, verify residual under 2mm.*

That translation layer — from observation to installer-executable action — is what Directive Engine builds.

## What’s in this repo

- `src/` — TypeScript implementation of the core engine
- `demo/` — browser-based 3D walkthrough (deployed at directive-engine.vercel.app)
- `schemas/` — JSON Schemas for inputs/outputs
- `datasets/toy_facade_v1/` — fixture data plus golden expected outputs
- `docs/` — overview, demo script, data contract

## Scan ingest (v0.2.1)

`src/pipelines/pointcloudIngest.ts` accepts ASCII PLY or XYZ point
clouds and, given nominal part lines, produces an `AsBuiltPosesDataset`
the engine consumes. The pipeline: anchors → rigid alignment (Horn's
method) → tube segmentation → PCA line fit → pose + confidence. Tests
in `src/__tests__/pointcloud.ingest.test.ts` exercise the path
end-to-end.

Try it: `npx tsx scripts/ingest-pointcloud.ts <scan.ply> <part-lines.json>`

The 5-beat demo still runs on pre-computed poses; the point-cloud path
is exercised by tests and the CLI script, not the browser viewer.

## Known limitations

The v0.2 engine has three intentional scopes worth naming up front:

- **Pose recovery returns identity rotation.** The line-fit pipeline
  recovers a part's translation from the PCA fit residual, but rotation
  is not extracted from the fit. Rotation directives (`rotate_to_index`)
  are emitted by quantizing against the named index features declared in
  the constraint set — the engine knows which discrete positions a part
  can occupy, not which one the scan suggests. Useful for a-priori
  constrained installs (slotted bolt patterns, indexed mounting
  brackets); less useful when the scan should determine which index was
  achieved. Recovering rotation from line-fit residuals is a planned
  enhancement.

- **One line per part.** Each part contributes a single defining edge or
  centerline to the PCA fit. Parts with multiple features (e.g., an
  L-bracket with two perpendicular edges) currently need to be decomposed
  into multiple `partId`s, each with its own line. Multi-line joint
  recovery is on the roadmap.

- **ASCII PLY and XYZ only.** Binary PLY support is the natural next
  layer — same parser shape, different reader. Not yet implemented
  because the post's scope is "primitives generalize," not "we ingest
  every format."

These are scope decisions, not bugs. The math chain that would close
each gap is mostly already in the codebase; what's missing is the
specific extraction or reader at the boundary.

## Core API usage (v0.2)
`generateDirectives` is the canonical entry point for producing installer-ready directives.
The contract assumes:
- **Units**: millimeters
- **Pose**: `T_world_part` (pose of part frame in world)
- **Rotation**: quaternion `[x, y, z, w]`
- **Statuses**: `ok | pending | clamped | blocked | needs_review`
- **Actions**: `translate | rotate | rotate_to_index | noop`

### Named kinematic features (optional, additive)
A `PartConstraint` may carry an optional `features` array declaring named
joints, slots, and indexed bolt patterns in part frame. Features are pure
**presentation metadata** — `generateDirectives` does not read them; the
engine output is identical with or without features declared. The
presentation layer (`src/presentation/format-directive.ts`) uses them to
render directives in installer language:

```
With features:    "Pivot +0.4° about J1 (CCW from outside face).
                   Translate +3.2mm along S2. Status: pending. Tolerance: ±2.0mm."
Without features: "Translate +3.2mm along part-frame Y. Status: pending. ..."
```

See `docs/02_data_contract.md` for the feature shape and
`src/presentation/format-directive.ts` for `formatDirective(step, constraint?)`.

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

## Quickstart

```bash
npm install
npm test                    # unit tests + golden-output regression
npm run validate            # validate datasets against JSON Schemas
npm run dev                 # serves the 5-beat 3D viewer at /
npm run gen                 # regenerate out/directives.json from the CLI
```

The engine entry point is `generateDirectives()` in `src/core/`. The viewer
at `/` reads `datasets/toy_facade_v1/`, runs the engine once on mount, and
drives the 5-beat walkthrough. See `docs/demo-script.md` for the
narrative and `docs/02_data_contract.md` for the schema shape.

Engine output is regression-tested against
`datasets/toy_facade_v1/expected_directives.json` (and the `toy_v0_1` golden
files).

## The 5-beat demo

The viewer at `/` walks the user through the engine end-to-end on
`datasets/toy_facade_v1/`:

1. **Detection** — facade rendered at as-built poses; deviated panels tinted
   yellow/red with arrows pointing toward nominal.
2. **Constraint** — camera dollies in; ghost geometry shows the focused
   panel's named DOF (joint, slot, indexed pattern).
3. **Directive** — `directive-card` overlay renders `formatDirective()` output
   in installer language (*"Pivot +0.4° about J1. Translate +3.2mm along S2."*).
4. **Apply** — the panel animates to its corrected pose. Status flips
   `pending → ok`.
5. **Verify** — `verification-panel` shows before/after deviation metrics with
   a `pass` chip when within tolerance.

See `docs/demo-script.md` for the full narrative and state machine.

## Tech stack
- **TypeScript** (strict, ES2022, bundler resolution)
- **Vite** (dev server + build) — see `vite.config.ts`. The demo is the build root.
- **Vitest** (unit tests) — see `vitest.config.ts`.
- **Three.js** (r160) — 3D viewer scaffolding under `src/viewer/`. Imported as ES modules; `OrbitControls` is loaded from `three/examples/jsm/controls/OrbitControls.js`.

## Viewer overlay styling
The 3D viewer's overlay uses portfolio-site class names
(`directive-card`, `verification-panel`, `metric-card`, `chip`, `callout`) so
markup is portable. Demo-scoped tokens (`--de-*`) live in
`src/styles/overlay.css`; responsive breakpoint rules live in
`src/styles/responsive.css`. For v0.2 the demo's CSS is duplicated from the
systemsforge.build site and synced by hand — see the header comment in
`overlay.css` for the source-of-truth file path.

### Touch controls

The viewer uses `OrbitControls` with one-finger rotate and two-finger
pinch-zoom. For touch gestures to reach OrbitControls instead of being
consumed as page scroll/zoom, **`touch-action: none` must be set on the
canvas wrapper** (`.de-canvas-wrap` in `overlay.css`). Without it, mobile
browsers will eat the drag gesture and only pinch-zoom will appear to
work — rotation will silently fail. The rule lives on the wrapper rather
than the parent `#viewer` element so the page and any scrollable overlay
cards keep their default touch behaviour outside the canvas region.

### Mobile viewport heights

Full-viewport containers on mobile must use `100dvh` (dynamic viewport
height) rather than `100vh`. `vh` includes space hidden behind the
mobile browser's dynamic URL bar / home-indicator strip, which pushes
bottom-anchored UI (the Back/Continue nav row) offscreen. The viewport
meta tag in `demo/index.html` carries `viewport-fit=cover`, and
anything pinned near `bottom: 0` (the beat-nav, directive card,
verification panel) pads with `env(safe-area-inset-bottom)` so it
clears the iOS home indicator. Keep these patterns when adding new
mobile layout — `vh` and a missing safe-area pad are the two ways the
bottom row gets clipped.

## Accessibility
- Beat transitions are announced via `aria-live="polite"`.
- `prefers-reduced-motion` snaps every tween to its end state.
- A "Text summary" link in the top-right opens a static dialog mirroring the
  5-beat narrative + the generated directive + verification metrics. Useful
  for screen readers, low-power devices, and share previews.
- The Three.js canvas is marked `aria-hidden`; semantic copy lives in the
  overlay.

## Recording the demo video

See `docs/capture-checklist.md` for the take procedure, browser setup,
compression, and self-hosting plan. Output assets live in the
systemsforge.build site repo under `site/static/video/`.

## License

MIT — see LICENSE.
