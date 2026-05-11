# Start Here

New to the repo? Three things to read, in this order:

1. **[README.md](./README.md)** — what the project is, how to install and run, the v0.1 engine contract.
2. **Live demo** — [directive-engine.vercel.app](https://directive-engine.vercel.app). The viewer walks five beats: Detection → Constraint → Directive → Apply → Verify.
3. **[docs/demo-script.md](./docs/demo-script.md)** — the canonical 5-beat narrative the viewer performs.

## Running locally

```bash
npm install
npm test
npm run dev      # serves the 5-beat 3D viewer at /
```

`npm run gen` regenerates `out/directives.json` from the `toy_v0_1` fixture
via the CLI in `src/cli/`.

## Where things live

- `src/core/` — engine: `generateDirectives()`, DOF projection, status logic. Don't change behavior here without a reason.
- `src/presentation/` — installer-language directive formatter (`formatDirective`).
- `src/viewer/` — Three.js scene, beat controller, animation, deviation arrows, DOF ghost geometry.
- `src/styles/` — overlay CSS using the portfolio-site class names.
- `datasets/toy_facade_v1/` — primary fixture the demo runs against.
- `schemas/` — JSON Schemas for inputs/outputs.
- `docs/demo-script.md` — 5-beat narrative.
- `docs/02_data_contract.md` — pose / constraint / directive shapes.
- `docs/capture-checklist.md` — instructions for recording the demo video.

## History

The original v0.1 sprint plan that bootstrapped the engine and a minimal table
viewer lives at `docs/archive/START_HERE-v0.1.md`. The v0.2 build replaced the
shell with the 5-beat 3D walkthrough described above.
