# Deploy state verification — 2026-05-11

## Main branch state

All 14 checklist items, verified against `origin/main` at `b5bd0d2` (Merge PR #129 — Phase 5):

- [x] `package.json`: `"name"` is `"directive-engine"` (Phase 5 shortened from `directive-engine-v0.1-impl`) — confirmed at `package.json:2`
- [x] `package.json`: `"version"` is `"0.2.0"` — confirmed at `package.json:3`
- [x] `package.json`: `"dependencies"` includes `three` — `"three": "^0.160.0"` at `package.json:28`
- [x] `src/viewer/` directory exists with `index.ts`, `scene.ts`, `beat-controller.ts`, `engine-bridge.ts` — all four present
- [x] `src/viewer/anim/` exists (`arrow-tween.ts`, `camera-tween.ts`, `easing.ts`, `panel-tween.ts`, `runner.ts`) and `src/viewer/viz/` exists (`deviation-arrows.ts`, `dof-ghosts.ts`, `feature-markers.ts`, `sprite-label.ts`)
- [x] `src/viewer/overlay/` directory exists with `directive-card.ts`, `verification-panel.ts`, `beat-nav.ts`, `headline.ts`, `fallback-view.ts` (plus `index.ts`)
- [x] `src/styles/overlay.css` exists (632 lines)
- [x] `src/styles/responsive.css` exists (198 lines)
- [x] `README.md` leads with live demo + case study links, not "Starter Kit" framing — opens with "Pixels to atoms — as-built deviations → installer-ready directives" and a "Live demo" link
- [x] `docs/archive/START_HERE-v0.1.md` exists (Phase 5 archive)
- [x] `docs/capture-checklist.md` exists with populated 5-beat sequence (177 lines)
- [x] `docs/visualization-notes.md` exists (63 lines)
- [x] `docs/demo-script.md` exists with Phase 2 canonical narrative (125 lines)
- [x] `datasets/toy_facade_v1/constraints.json` exists (Phase 0 fixture)

Note: local `main` was stale; `git fetch origin main` advanced it from `24a9080` (PR #122) to `b5bd0d2` (PR #129). After fetch, every Phase 0–5 merge commit (#123–#129) is on `origin/main`.

## Build entry point

- **Project-root `index.html`** is the old "Directive Engine Web" minimal shell (loads `/src/web/index.ts`). It is **not** referenced by the build — `vite.config.ts` sets `root: "demo"`, so vite ignores any HTML outside `demo/`.
- **`demo/index.html`** is a different old shell ("Directive Engine Demo — Minimal shell for browser-based runs", with dataset/mode selectors and Runbook panels). It loads `./main.ts`. This file is the `main` input in `vite.config.ts` and emits to `dist/index.html`.
- **`demo/viewer.html`** is the new 5-beat 3D viewer (`<div id="viewer">`, loads `./viewer-main.ts`, pulls in `overlay.css` + `responsive.css`). It is the `viewer` input in `vite.config.ts` and emits to `dist/viewer.html`.
- After `npm run build`, `dist/` contains `index.html` (12.14 kB, old shell) and `viewer.html` (2.87 kB, new viewer) at the top level — there is **no** `dist/demo/` subdirectory because `root: "demo"` strips the prefix.
- **New 5-beat viewer is reachable at**: `<deploy-host>/viewer.html` — **not** `/demo/viewer.html`.

## Vercel configuration

- `vercel.json`: **does not exist** in the repo (verified with `ls`).
- `.github/workflows/`: only `ci.yml` (test + typecheck on push/PR). No deploy workflow — Vercel is presumably wired via its GitHub app, not via Actions.
- Build command (from `package.json`): `npm run build` → `vite build`, which writes to `dist/`. With no `vercel.json`, Vercel will auto-detect Vite and serve `dist/` as a static site.
- **No rewrites/redirects defined.** `/` therefore maps directly to `dist/index.html`.

## Live deploy state

- `curl https://directive-engine.vercel.app/` → **HTTP 403 `host_not_allowed`** (sandbox network allowlist blocks the host).
- `curl https://directive-engine.vercel.app/demo/viewer.html` → same 403.
- `curl https://directive-engine.vercel.app/viewer.html` → same 403.
- Could not verify the live deploy from this environment. Based on the local build output and absence of rewrites, the deploy almost certainly serves:
  - `/` → old "minimal shell" (`dist/index.html`, built from `demo/index.html`)
  - `/viewer.html` → new 5-beat viewer (`dist/viewer.html`, built from `demo/viewer.html`)
  - `/demo/viewer.html` → 404 (Vite strips the `demo/` prefix because `root: "demo"`)

## Test suite

- `npm test -- --run`: **PASS** — 24 test files, **185 tests passed**, 0 failed, duration 7.53s.
- `npm run build`: **PASS** — 138 modules transformed, 1.59s, emits `dist/index.html` + `dist/viewer.html` + assets.
- Build warns that the viewer chunk is 542 kB (Three.js) — informational, not a failure.

## Diagnosis

The new 5-beat viewer is not at the root URL because `vite.config.ts` declares **two** build inputs — `demo/index.html` (the old minimal shell) as `main`, and `demo/viewer.html` (the new viewer) as `viewer`. With `root: "demo"`, both files are emitted to `dist/` at the top level, so the old shell wins the `/` slot at `dist/index.html` and the new viewer lives at `dist/viewer.html`. There is no `vercel.json` rewrite to redirect `/` to `/viewer.html`, and no Vercel build override to point at a different entry, so a vanilla static deploy serves the old `dist/index.html` at `/`. The Phase 0–5 work landed correctly on `main`; the entry point was simply never swapped.

A secondary point of confusion: the project-root `index.html` looks like it might be the entry, but `root: "demo"` makes vite ignore it entirely. The path `/demo/viewer.html` on the deploy will 404 because vite strips the `demo/` prefix at build time.

## Recommended fix

**(a) Move the new viewer to the root index.html — replace the old shell entry point.**

Simplest, lowest-risk option: in `vite.config.ts`, drop the `main: demo/index.html` input and rename the `viewer` input to `main` (or just keep one input pointed at `demo/viewer.html`). The new viewer then builds to `dist/index.html` and is served at `/` with no Vercel config needed. The old minimal shell is no longer the public entry, which matches the v0.2 framing in README. Alternatives (b/c) work too but add either a Vercel config file or keep a dead shell in the build output; (d) keeps the wrong UI at the public URL and is not what the README promises.
