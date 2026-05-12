# Visualization notes

Conventions established in Phase 3. Read this before adding new visuals so
the demo stays internally consistent.

## Colors

| Role | Hex | Used by |
|---|---|---|
| Deviation, warning | `#facc15` (yellow) | Panel tint at beat 1, arrows in 1×–2× tolerance band |
| Deviation, severe | `#ef4444` (red) | Panel tint at beat 1, arrows above 2× tolerance, hatched forbidden ghost |
| Allowed motion | `#60a5fa` (soft blue) | All DOF ghost translucent fills |
| Joint feature | `#14b8a6` (teal) | Joint sphere + axis line |
| Slot feature | `#f59e0b` (amber) | Slot capsule |
| Index feature | `#8b5cf6` (violet) | Index dots |

Yellow/red are reused from the Phase 1 panel-highlight scheme so a viewer
who saw beat 1 carries the same color meaning into beats 2-3.

## Scale conventions (mm)

| Primitive | Size | Notes |
|---|---|---|
| Joint sphere | 30 mm radius | Reads as a hinge point at panel scale (1500×1000 mm) |
| Joint axis line | 200 mm | Centered on the sphere |
| Slot capsule (feature marker) | 20 mm radius, 600 mm default length | Falls back to default when the constraint declares no per-axis travel limit |
| Slot ghost capsule (DOF) | 60 mm radius, 2× allowed travel | Bigger than the marker so the "you can move this far" volume reads at a glance |
| Index dot (feature) | 18 mm radius | Placed at 300 mm ring radius around the axis |
| Index ghost dot | 36 mm radius | Placed at 380 mm ring radius around the axis |
| Joint arc (DOF) | 273-350 mm inner/outer radius | Ring sector swept across the allowed rotation range |
| Sprite label | ~140 mm height | Sized in world units so labels stay readable as the camera moves |
| Deviation arrow | min 80 mm; otherwise 40× residual | Visual exaggeration: real residuals (a few mm) would be invisible at panel scale |

## Animation timings

| Tween | Default duration | Easing |
|---|---|---|
| Camera | 800 ms | `easeInOutQuad` |
| Panel pose (Apply) | 800 ms | `easeInOutQuad` |
| Arrow shrink (Apply) | 600 ms | `easeInOutQuad` |

"Calm/considered" feel per the Phase 3 plan. If a future feel-pass wants
punchier transitions, reduce to ~400 ms; if cinematic, raise to ~1200 ms.

## Hatched material

Implemented in `src/viewer/viz/dof-ghosts.ts` as a small `ShaderMaterial`.
Stripes are computed in object-space XY with a modulo, then a `step()` cuts
the off-stripe fragments via `discard`. Cheaper than a decal texture and
crisp at any zoom level.

If a future visual needs hatching in a different direction or color, lift
this material to its own file and parameterize the stripe angle.

## Cancel-on-input

Camera tweens cancel when the user grabs `OrbitControls` (the `"start"`
event). Panel + arrow tweens are not cancelled by input — they always run to
completion so the post-Apply scene state is correct.

If a beat advances while a tween is running, the AnimRunner replaces the
in-flight tween with the new one keyed identically. End states remain
correct because the new tween reads `from` as the current scene state.

## Touch input — `touch-action: none` is load-bearing

OrbitControls receives single-finger drag (rotate) and two-finger pinch
(dolly) via touch events on `renderer.domElement` (the `<canvas>`). Mobile
browsers will otherwise consume single-finger drag as page-pan and the
canvas never sees it. To keep this working, both must be true:

1. `.de-canvas-region` and the `<canvas>` itself have `touch-action: none`
   (set in `src/styles/overlay.css` and inline in `src/viewer/scene.ts`).
2. `controls.touches` is explicitly set to `{ ONE: TOUCH.ROTATE, TWO:
   TOUCH.DOLLY_PAN }` in `src/viewer/scene.ts`. `enablePan = false` makes
   the pan portion of `DOLLY_PAN` a no-op; pinch still works as dolly.

Do not drop the inline `touch-action` on the canvas — iOS Safari does not
always inherit it from the wrapper when WebGL canvases are involved, even
with the style set on `#viewer`. If a future change touches scene mount
order or CSS, verify one-finger drag still rotates on a phone.

## Camera framing

All camera waypoints (wide shot + per-beat close-ups) flow through
`src/viewer/camera-framing.ts`. The math is a single primitive:

```
fitDistance(bboxRadius, vFOV, aspect, padding):
    halfV = vFOV / 2
    tanV  = tan(halfV)
    tanH  = aspect * tanV
    return bboxRadius / min(tanV, tanH) * padding
```

`frameBox(bbox, fov, aspect, padding)` wraps `fitDistance()` over a
`THREE.Box3` — uses the AABB's bounding-sphere radius (half the diagonal),
which is conservative but guarantees the AABB fits at any orientation.

The AABB itself comes from the *rendered geometry*
(`THREE.Box3.setFromObject()` via `unionWorldBox()` / `objectWorldBox()`),
not from fixture centroids — so adding panels, changing panel dimensions,
or tweaking the as-built poses automatically reframes the wide shot
correctly.

`ResizeObserver` on the canvas region re-snaps the camera when aspect
changes (orientation flip, dev-tools open). `window` resize/orientationchange
listeners back this up for iOS Safari where the canvas observer can fire
late during the URL-bar collapse animation. The reset-view button reuses
the same `computeBeatWaypoint()` helper so it always lands on the current
beat's canonical framing.
