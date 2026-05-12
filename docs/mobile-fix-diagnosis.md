# Mobile fix diagnosis (Phase 6b)

Date: 2026-05-12
Branch: `claude/mobile-camera-touch-controls-urfO2` (will be re-pushed as
`phase-6b-mobile-camera-layout`).

The Phase 6 fixture extension (9-panel facade) is live on
`directive-engine.vercel.app/` but three mobile-portrait bugs remain. This
note records the root cause analysis from a code read of `src/viewer/*`,
`src/styles/*`, and `demo/index.html`. A live DevTools capture would tighten
the numbers below, but the failure modes are fully visible from the source
and reproducible by inspection.

## Geometry of the facade

`datasets/toy_facade_v1/nominal.json` puts 9 panel centres on a 3×3 grid:

| axis | centres                      | centre-to-centre span | panel size |
|------|------------------------------|-----------------------|------------|
| X    | −1550, 0, +1550 mm           | 3100 mm               | 1500 mm    |
| Y    | −1050, 0, +1050 mm           | 2100 mm               | 1000 mm    |

True facade extents (centre span + one panel):

- Full width  = 3100 + 1500 = **4600 mm** (4.6 m)
- Full height = 2100 + 1000 = **3100 mm** (3.1 m)
- Diagonal    = √(4.6² + 3.1²) ≈ **5.55 m**

## Issue 1 — Camera too close on mobile portrait

### Root cause

Two compounding bugs in `src/viewer/index.ts`:

1. **`computePanelBounds()` (line 544) only walks centre positions.** It
   does not add the panel half-extent, so `spanX = 3100`, `spanY = 2100`
   instead of 4600/3100. The Phase 6 writeup
   (`docs/camera-fix-diagnosis.md`) computed a bbox but the in-tree
   implementation never reflected panel size.

2. **`deriveCameraPosition()` (line 561) does not use the camera's FOV.**
   It uses
   `radius = (max(spanX, spanY) * 1.8 + 2500) * aspectFactor`
   with `aspectFactor = 1.55` for portrait. With the under-counted spans
   this yields camera distance ≈ 13.3 m from facade centre. At 35° vertical
   FOV and a typical portrait aspect of 0.45 the horizontal FOV is ≈ 16°,
   so the visible horizontal extent at 13.3 m is ≈ 3.7 m — short of the
   facade's true 4.6 m width. Result: the side panels fall outside the
   frame on portrait phones.

3. **Resize doesn't recompute camera position.** The scene's
   `ResizeObserver` (scene.ts:140) updates `camera.aspect` but never
   re-derives the position, so rotating from landscape→portrait stays
   framed for landscape.

### Fix

- Include the panel half-extent in `computePanelBounds()`.
- Replace the heuristic radius with proper FOV math:
  `distV = (spanY/2) / tan(vFOV/2) * padding`,
  `distH = (spanX/2) / tan(hFOV/2) * padding`, take the max.
- Padding factor: 1.15 for landscape, 1.25 for portrait.
- Re-run framing on viewport resize and update the cached wide-shot
  waypoint so beats 1 and 5 reflect the new aspect.

## Issue 2 — Bottom overlay/nav offscreen on mobile

### Root cause

`demo/index.html` declares `#viewer` as `position: fixed; inset: 0`
(full-viewport canvas), and `mountViewer()` appends the overlay (`.de-overlay`)
inside `#viewer` with `position: absolute; inset: 0`. There is no
canvas-vs-overlay split — the canvas always fills the entire viewport and the
overlay layers on top of it.

The Phase 4 mobile spec ("canvas 60vh top, overlay 40vh bottom") was treated
as a bottom-sheet overlay over a full-screen canvas. In practice on iOS
Safari + Pixel-class viewports the bottom-pinned cards (`bottom: 76px`) and
beat-nav (`bottom: 12px`) end up under the browser chrome / home indicator,
because `100vh` is the dynamic viewport height that includes the
collapsing URL bar. The cards are technically on-screen but hidden behind
chrome.

### Fix

Per the design decision (constrain canvas, keep overlay full-viewport):

- Introduce a `de-canvas-region` wrapper inside `#viewer`. Scene mounts to
  this wrapper instead of `#viewer` directly.
- Desktop/tablet: wrapper is 100% × 100% (no visible change).
- Mobile portrait (<768px): wrapper is `width: 100%; height: 60dvh` anchored
  to the top. The overlay is left covering the whole `#viewer` so the
  bottom-pinned cards / nav land in the bottom 40dvh region under the
  shrunken canvas.
- Switch the mobile bottom-pin offsets to use `dvh` / `env(safe-area-inset-bottom)`
  so the nav clears the iOS home indicator and dynamic URL bar.

## Issue 3 — Touch rotation broken (zoom works)

### Root cause

`demo/index.html` sets `touch-action: none` on `#viewer` but **not** on the
`<canvas>` itself. On iOS Safari, `touch-action` is not always inherited
correctly through canvases (the canvas's user-agent style can re-enable
touch panning), so a one-finger drag on the canvas is consumed as page-pan
and never reaches OrbitControls. Two-finger pinches still reach the
renderer because pinch is `touch-action: pinch-zoom` only when set; with
`none` on the wrapper at least pinch survives, but one-finger drag is
swallowed.

OrbitControls itself is fine — by default it handles touch:
`ONE: TOUCH.ROTATE`, `TWO: TOUCH.DOLLY_PAN`. With `controls.enablePan =
false`, the second-finger pan is a no-op; pinch still triggers dolly.

### Fix

- Apply `touch-action: none` and `user-select: none` directly to the
  `canvas` element.
- Explicitly set `controls.touches = { ONE: TOUCH.ROTATE, TWO:
  TOUCH.DOLLY_PAN }` for documentation and to be safe against future
  three.js default changes.

## Verification plan

- Build with `npm run build` and serve via `npm run preview`.
- Open in Chrome DevTools at Pixel 7 Pro (412×915), iPad Mini (768×1024),
  desktop default. Capture Beat 1 wide shot at each.
- On the phone profile, verify one-finger drag rotates and pinch zooms;
  outside the canvas, page should still scroll (it doesn't, because the
  whole viewport is fixed — that's fine, the spec is "page doesn't scroll
  inside canvas" and there is no page scroll either way).
- Tap reset-view button (Phase 6b addition): camera snaps to current
  beat's default waypoint.
