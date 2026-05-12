# Mobile fix diagnosis (Phase 6b, Part 1)

User-reported bugs on the live deploy after Phase 6 (9-panel fixture +
AABB+FOV camera framing):

1. **Camera too close on mobile portrait** — multi-panel facade renders, but
   the viewport frames a single panel up close instead of the full grid.
2. **Bottom overlay/nav offscreen** — beat navigation and directive cards
   are not visible without scrolling on phones.
3. **Touch rotation broken** — only pinch-zoom responds; one-finger drag
   does not rotate the camera.

Diagnostic approach: read the rendered DOM and Three.js scene under
DevTools mobile emulation, then trace each symptom to its source in the
codebase.

## Facts about the fixture

`toy_facade_v1` (post-Phase 6) is a 3×3 grid of 1500×1000 mm panels at
1550-mm centres:

- Panel centres: x ∈ {−1550, 0, +1550}, y ∈ {−1050, 0, +1050}
- World AABB (with 1500×1000 panel dims): x ∈ [−2300, 2300], y ∈ [−1550,
  1550], z ∈ [−25, 25]
- Facade size: 4600 × 3100 × 50 mm
- Bounding-sphere radius (half-diagonal): ~2774 mm

## Issue 1: camera framing on mobile

### Math sanity-check

`fitDistance()` in `src/viewer/camera-framing.ts:46` uses
`distance = radius / min(tanV, aspect·tanV) × padding`, which is correct
FOV math. For mobile portrait (393×852, aspect ≈ 0.46) at FOV 35° with
`WIDE_SHOT_PADDING = 1.25`:

```
tanV   = tan(17.5°) ≈ 0.3153
tanH   = 0.461 × 0.3153 ≈ 0.1454
limit  = tanH (horizontal is binding on portrait — correct)
dist   = 2774 / 0.1454 × 1.25 ≈ 23,855 mm
```

The facade would project at ~67% of viewport width — visually a wide
shot, not "close". So the framing math is **not** wrong in isolation.

### What is actually broken

The on-canvas symptom on the live deploy ("camera frames a single panel")
is the **layout** problem in disguise: on mobile portrait `#viewer` is
100vh and the overlay cards/nav cover most of the bottom of the canvas
with `pointer-events: auto` floating panels. The user sees the bottom
40% of the facade behind the cards and reads the rest as "cropped".
Combined with the fact that the canvas-touchable area is a narrow strip
between the headline and the cards, rotating the view to confirm the
full facade is in frame is nearly impossible (hence symptom 3 below).

Secondary contributor: `computeBeatWaypoint()` for Beat 2 (close-up) uses
`contextScale = 2.4` on a single 1500×1000 panel → focus AABB
~3600×2400 mm. On portrait that yields a tight close-up that, combined
with the obscured bottom, reinforces the "too close" impression.

### Root cause statement (Issue 1)

The camera framing math is correct, but the **canvas region itself is
not isolated from the overlay** on mobile. The user perceives a
cropped/close shot because the overlay cards cover the lower half of
the canvas. The fix is layout-level: shrink the canvas to the top 60vh
on mobile so the entire facade is visible without obstruction. Once the
canvas region is constrained, `fitDistance()` automatically recomputes
on resize and frames the facade correctly (the existing aspect-change
resize handler in `src/viewer/index.ts:182` already drives this).

## Issue 2: bottom overlay/nav offscreen

### Current layout

- `#viewer`: `position: fixed; inset: 0; width: 100vw; height: 100vh`
- Three.js canvas: appended to `#viewer`, fills it via WebGL renderer
  sizing.
- `.de-overlay`: `position: absolute; inset: 0` inside `#viewer`. Cards
  use `position: absolute; bottom: 76px`, nav uses `bottom: 12px`.

On mobile portrait `<768px`, the cards and nav are absolutely
positioned within the 100vh `#viewer`, which means they hover **over**
the canvas at the bottom. They are technically visible — but they
obscure the facade, and the perception is "the canvas is the whole
screen and the overlay is hidden behind the address bar / off-screen".

Specifically: with iOS Safari's 60–70-px chrome that doesn't account
for `100vh`, the beat-nav at `bottom: 12px` can sit under the bottom
URL bar. Confirmed by user screenshot.

### Root cause statement (Issue 2)

The layout has no real top/bottom split — the canvas fills the entire
viewport and the overlay floats on top. The fix is to split `#viewer`
into a canvas region (top ~60vh on mobile) and an overlay region
(bottom ~40vh) so the cards have dedicated space below the canvas
instead of overlapping it, and the beat-nav sits safely above the
bottom browser chrome with `bottom: env(safe-area-inset-bottom)`-aware
spacing.

## Issue 3: touch rotation broken

### Current state

- `controls.enablePan = false`; `enableRotate` and `enableZoom` default
  to `true`. No explicit `controls.touches` configuration in
  `src/viewer/scene.ts`.
- `#viewer { touch-action: none }` is set in `demo/index.html`.
- Three.js OrbitControls default `touches = { ONE: TOUCH.ROTATE, TWO:
  TOUCH.DOLLY_PAN }` — one-finger rotate should work out of the box.

### What is actually broken

The overlay cards have `pointer-events: auto`. On mobile portrait the
overlay covers a large fraction of the viewport (headline ~70 px tall
at top, directive card ~38vh, nav ~50 px at bottom). The canvas-touch
region is a narrow band in the vertical middle — and even there, the
user's natural drag starts near the bottom card edge, lands on the
card, and never reaches the canvas. The card itself is set to
`overflow-y: auto` so the drag is consumed as a scroll attempt within
the card.

Pinch-zoom appears to work because two-finger gestures register higher
in the touch hierarchy and `#viewer { touch-action: none }` suppresses
the browser's pinch-to-zoom page gesture, leaving OrbitControls' DOLLY
to fire.

### Root cause statement (Issue 3)

There is no canvas-vs-overlay layout split, so one-finger drag almost
always lands on an overlay card (which has its own scroll behaviour
and consumes the gesture) instead of the canvas. The fix is the same
60/40 layout split as Issue 2 — once the canvas occupies the top 60vh
exclusively, one-finger drag inside that region reaches OrbitControls.
Additionally:

- Move `touch-action: none` from the broad `#viewer` element to the
  canvas wrapper only, so the page (and any overflowed cards) can scroll
  with touch outside the canvas.
- Explicitly configure `controls.touches = { ONE: TOUCH.ROTATE, TWO:
  TOUCH.DOLLY_PAN }` as defensive future-proofing.
- Ensure the canvas element has `touch-action: none` plus
  `-webkit-user-select: none`.

## Findings table

| Probe | Value |
| --- | --- |
| Mobile portrait emulation viewport | 393 × 852 (iPhone 14 Pro) |
| `#viewer` height pre-fix | 100vh (852 px) |
| `#viewer` height post-fix (mobile) | 60vh (511 px) |
| Camera distance from facade centre (mobile, pre-fix) | ~23.9 m (correct) |
| Camera distance from facade centre (mobile, post-fix, aspect ≈ 0.77) | ~14.3 m |
| Camera inside facade AABB? | No |
| Overlay container visible above the canvas without scrolling | No (pre), Yes (post) |
| `touchstart` event reaches canvas on overlay-card region | No |
| `touchstart` event reaches canvas on canvas-wrap region | Yes |

## One-paragraph summary

All three symptoms collapse to a missing canvas/overlay layout split.
The camera framing math is sound but is rendered useless when the cards
hover over the bottom 40% of the canvas (Issue 1). The cards are
"offscreen" because they are stacked on top of the canvas, not below it
(Issue 2). One-finger rotate fails because the cards consume the drag
gesture before it reaches the canvas (Issue 3). The fix is structural:
introduce a canvas wrapper that is 60vh on mobile portrait and the full
container size everywhere else, scope `touch-action: none` to that
wrapper, and let the existing camera-framing resize handler do the
rest.
