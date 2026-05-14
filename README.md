# Directive Engine
**Pixels to atoms — as-built deviations → installer-ready directives** (pivot / translate / index) with a 5-beat 3D walkthrough and pass/fail verification.

- **Live demo:** [directive-engine.vercel.app](https://directive-engine.vercel.app)
- **Case study:** [systemsforge.build/work/directive-engine](https://systemsforge.build/work/directive-engine)
- **Demo video (60–90s):** *(link added when capture lands)*

This repo is a **contracts-first** TypeScript implementation:
- Engine in `src/core/` (`generateDirectives()` is the canonical entry point).
- Presentation layer in `src/presentation/` (installer-language formatter).
- Three.js viewer in `src/viewer/` with a 5-beat guided walkthrough.

## What this solves
When reality capture shows deviations, teams still need **field-executable instructions**:
- what to move (and in which frame),
- how much,
- what’s allowed (constraints),
- and how to verify closure.

## What’s included
- `src/core/` — engine: `generateDirectives()`, DOF projection, status logic
- `src/core/scan/` — point-cloud segmentation, PCA line fit, pose-from-fit + confidence
- `src/pipelines/` — end-to-end pipelines incl. point-cloud ingest
- `src/presentation/` — installer-language directive formatter
- `src/viewer/` — Three.js scene, beat controller, animations, deviation arrows, DOF ghosts
- `src/styles/` — overlay CSS using portfolio-site class names
- `docs/` — demo script, data contract, capture checklist
- `schemas/` — JSON Schemas for inputs/outputs
- `datasets/` — fixture datasets + golden expected outputs
- `site/` — markdown “website bones” mirrored to the portfolio site

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

## Core API usage (v0.1 / v0.2-features)
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

[MIT](LICENSE)
