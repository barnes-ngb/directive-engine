# Mobile fix diagnosis (Phase 6b)

Date: 2026-05-12
Branch: `phase-6b-mobile-camera-layout` (PR #135).

Phase 6 on `main` already redid the camera framing math (see
`docs/camera-fix-diagnosis.md` and `src/viewer/camera-framing.ts`) and ships
proper AABB-derived framing with FOV/aspect awareness plus a resize re-snap.
Phase 6b layers the remaining mobile-only fixes on top of that work:

1. **Bottom overlay/nav offscreen on mobile portrait**
2. **Touch rotation broken (zoom works, drag doesn't)**
3. **No way to reset framing after free-orbit drags the camera away**

## Issue 1 — Bottom overlay/nav offscreen on mobile

### Root cause

`demo/index.html` declares `#viewer` as `position: fixed; inset: 0` (full
viewport canvas), and `mountViewer()` appends the overlay (`.de-overlay`)
inside `#viewer` with `position: absolute; inset: 0`. There is no
canvas-vs-overlay split — the canvas always fills the entire viewport and
the overlay layers on top of it.

The Phase 4 mobile spec ("canvas 60vh top, overlay 40vh bottom") was treated
as a bottom-sheet overlay over a full-screen canvas. In practice on mobile
Safari and similar viewports the bottom-pinned cards (`bottom: 76px`) and
beat-nav (`bottom: 12px`) end up under the browser chrome / home indicator,
because `100vh` is the dynamic viewport height that includes the collapsing
URL bar and excludes the safe-area inset.

### Fix

- Introduce a `de-canvas-region` wrapper inside `#viewer`. The Three.js
  scene mounts to this wrapper instead of `#viewer` directly.
- Desktop/tablet: wrapper is 100% × 100% (no visible change).
- Mobile portrait (`max-width: 767px`): wrapper is `height: 60dvh` anchored
  to the top. The overlay continues to cover the whole `#viewer` so the
  bottom-pinned cards / nav land in the bottom 40dvh region under the
  shrunken canvas.
- Bottom-pin offsets use `calc(... + env(safe-area-inset-bottom, 0px))` so
  the nav clears the iOS home indicator. `max-height` on the cards switches
  from `vh` to `dvh` so the dynamic viewport drives the bound.

## Issue 2 — Touch rotation broken

### Root cause

`demo/index.html` sets `touch-action: none` on `#viewer`, but **not** on
the `<canvas>` itself. On iOS Safari `touch-action` is not always inherited
correctly through WebGL canvases — the user-agent style can re-enable
single-finger panning — so a drag on the canvas is consumed as page-pan and
never reaches OrbitControls. Two-finger pinches still survive because the
dolly gesture is recognised at the canvas before the page-pan filter runs.

OrbitControls itself is fine. By default it maps `ONE: TOUCH.ROTATE`,
`TWO: TOUCH.DOLLY_PAN`. With `controls.enablePan = false` the pan portion
of `DOLLY_PAN` is a no-op; pinch still triggers dolly.

### Fix

- Apply `touch-action: none` and `user-select: none` directly to the
  `<canvas>` element in `src/viewer/scene.ts` (both as inline style and via
  CSS on `.de-canvas-region > canvas`).
- Explicitly set `controls.touches = { ONE: TOUCH.ROTATE, TWO:
  TOUCH.DOLLY_PAN }` so future three.js default changes don't silently
  break the mapping.

## Issue 3 — Camera reset after free-orbit

### Root cause

Once the user grabs OrbitControls, the camera tween cancels (Phase 3
"free-orbit always wins") and there is no path back to the beat's default
framing short of stepping forward and back. New visitors on phones who
explore the scene end up looking at the floor or the back of the facade
with no obvious recovery.

### Fix

Add a small "Reset view" button in the top-right of the overlay
(`src/viewer/overlay/reset-view-button.ts`). It calls
`computeBeatWaypoint(...)` (the same helper that drives initial framing
and resize re-snaps) and tweens the camera back over
`DEFAULT_CAMERA_DURATION_MS`. The button collapses to icon-only on mobile
to keep the corner uncluttered next to the fallback link.

## Verification plan

- Build with `npm run build` and serve via `npm run preview`.
- DevTools mobile emulation at Pixel 7 Pro (412×915), iPad Mini (768×1024),
  desktop default. Beat 1 wide shot — confirm all 9 panels are visible at
  each viewport (this is now true automatically because main's
  `frameBox()` uses the real AABB plus FOV/aspect).
- Drag with one finger on the canvas — camera rotates.
- Pinch — camera zooms.
- Tap "Reset view" after dragging — camera tweens back to the current
  beat's default waypoint.
- Mobile portrait: cards + beat-nav visible above the home indicator with
  no horizontal scrolling.
