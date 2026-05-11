# Camera framing diagnosis (Phase 6, Part 1)

Reproduced bug: on mobile portrait (~393×852) the viewer renders only the top
edge of a yellow panel in the lower portion of the canvas, with the rest of
the canvas dark. The 5-beat overlay UI renders correctly above.

## Current state (pre-fix)

### Panel positions

`toy_facade_v1` ships two panels (the fixture-extension half of Phase 6
replaces this with nine):

| partId | nominal centre (mm) | nominal quaternion |
|---|---|---|
| P-0001 | (997, 1, 0) | identity |
| P-0002 | (1998.5, 4.5, 0) | 90° about Z |

Panel dimensions are `DEFAULT_PANEL_DIMENSIONS = 1500 × 1000 × 50`. P-0002's
90° Z-rotation swaps its width/height in world space, so its world AABB is
1000 wide × 1500 tall.

True world AABB of the rendered geometry:
- x ∈ [247, 2498.5]   (width 2251.5 mm)
- y ∈ [-745.5, 754.5] (height 1500 mm)
- z ∈ [-25, 25]

### Bounds the code currently computes

`src/viewer/index.ts:544 computePanelBounds()` iterates only `p.nominal.t`
(panel *centres*) and clamps each span to `DEFAULT_PANEL_DIMENSIONS`:

```
min/max from centres only: x ∈ [997, 1998.5], y ∈ [1, 4.5]
spanX = max(1001.5, 1500) = 1500
spanY = max(3.5,    1000) = 1000
center = (1497.75, 2.75, 0)
```

So the code thinks the facade is 1500×1000 mm, when it is actually
2251×1500 mm. The center is also offset ~250 mm in Y from the true visual
centre.

### Default camera position

`deriveCameraPosition()` (`src/viewer/index.ts:561`) is a pure heuristic with
no FOV math:

```
aspectFactor = portrait ? 1.55 : 1.0
radius       = max(spanX, spanY) * 1.8 + 2500
position     = center + (radius*0.7, radius*0.4, radius*0.7)
```

Camera FOV is 35° vertical (`src/viewer/scene.ts:71`).

### Per-beat waypoints

`pickCameraWaypoint()` (`src/viewer/index.ts:446`) uses a different,
incompatible heuristic for beats 2–4:

```
baseRadius   = max(widthMm, heightMm) * 3.2   // hardcoded constants
radiusScale  = 1.0 | 1.15 | 1.1               // per beat
aspectFactor = portrait ? 1.35 : 1.0          // different number
radius       = baseRadius * radiusScale * aspectFactor
position     = panelCenter + (r*0.55, r*0.35, r*0.85)
```

The two heuristics use different aspect factors (1.55 vs 1.35) and different
offset directions; they share no math.

### OrbitControls target

Set once at mount to `bounds.center` (`scene.ts:112`). For beats 2–4 the
camera waypoint moves the target to the focused panel's group position, but
`computePanelBounds` is never recomputed after panels move, so the wide-shot
fallback always uses the initial centroid centre.

## Root cause

The Phase 4 portrait fix (the 1.55× / 1.35× aspect multipliers) is a tuning
constant, not a derivation. It happens to keep two panels visible at common
portrait aspect ratios but fails as soon as the scene's actual AABB grows
beyond the assumed extent — exactly what Phase 6 does by going to nine
panels. Compounding factors:

1. `computePanelBounds` uses only panel centroids and clamps spans to
   `DEFAULT_PANEL_DIMENSIONS`, so it under-reports facade size whenever
   panels are wider/taller than the centroid spread.
2. Neither code path uses field-of-view math, so distance ≠ a function of
   what the camera can actually see.
3. The two heuristics (default vs per-beat) diverge; tuning one does not
   guarantee the other behaves.

The visible symptom on portrait — yellow panel cropped at the bottom of the
canvas — is consistent with beat 2's narrow horizontal FOV (~16.5° on
393×852) failing to contain a 1500 mm-wide panel at the heuristic distance,
combined with a steep downward tilt that pushes the top edge of the panel
into the lower portion of the screen.

## One-paragraph root cause statement

The viewer's camera is positioned by hardcoded heuristics that do not derive
from the rendered geometry's true bounding box or the current viewport's
field of view; the Phase 4 portrait multipliers compensate roughly for the
two-panel fixture but cannot scale to a denser scene. The fix is to compute a
real world-space AABB (panel mesh extents, not just centroids), then place
the camera at a distance derived from FOV math
(`distance = bbox_radius / min(tan(vFOV/2), aspect · tan(vFOV/2)) · padding`)
with a single shared direction vector. Per-beat waypoints become AABB-scaled
nudges off the same formula. Recompute on resize.

## Required fix shape

- `computeSceneBounds(meshes)` walks each `THREE.Object3D` and unions its
  world-space AABB. Cached after mount; recomputed only if panels move
  (beat-4 panel tween).
- `computeCameraDistance(bboxRadius, fovDeg, aspect, padding)` is a pure
  function. Padding default 15%.
- Wide shot: distance from full-facade AABB.
- Beat 2–4: distance from focused-panel AABB (small) plus a constant
  "context cushion" so neighbours stay in frame.
- Resize handler recomputes camera position when aspect changes, not just
  `camera.aspect`.
- One direction vector, normalised, shared between default + per-beat
  framing: `(0.55, 0.35, 0.85).normalize()` (front-right, mild downward
  tilt; matches Phase 1's intent).
