# toy_facade_v1

Synthetic fixture for the 5-beat directive-engine walkthrough. Tuned to
narrate the thesis end-to-end on a single static dataset.

## Layout

3 × 3 panel grid, viewed head-on (facing +Z):

```
   P-01  P-02  P-03      ← y = 2100 mm (top row)
   P-04  P-05  P-06      ← y = 1050 mm (middle row, hero band)
   P-07  P-08  P-09      ← y =    0 mm (bottom row)
   x=0   x=1550 x=3100
```

Panel dimensions: 1500 mm × 1000 mm × 50 mm.
Reveal gap: 50 mm horizontal and vertical.
Facade footprint: 4600 mm × 3100 mm.

## Panel roles

| partId | role            | as-built deviation                                         | engine status     |
|--------|-----------------|------------------------------------------------------------|-------------------|
| P-01   | nominal         | ≤ 0.6 mm noise                                             | `ok`              |
| P-02   | **mild**        | +3.5 mm along S2 (vertical slot)                           | `pending` → `ok`  |
| P-03   | nominal         | ≤ 0.7 mm noise                                             | `ok`              |
| P-04   | nominal         | ≤ 0.5 mm noise                                             | `ok`              |
| P-05   | **hero**        | −1.0 mm X, +6.0 mm Y, +2.0° about J1                       | `pending` → `ok`  |
| P-06   | nominal         | ≤ 0.4 mm noise                                             | `ok`              |
| P-07   | **clamped**     | +8.0° about J1 (exceeds allowed sweep of ±5°)              | `clamped`         |
| P-08   | nominal         | ≤ 0.4 mm noise                                             | `ok`              |
| P-09   | nominal         | ≤ 0.7 mm noise                                             | `ok`              |

P-05 is the hero panel — beat 2 dollies in on it; beat 4's apply animation
runs against its pose. P-07 demonstrates honest failure: the engine clamps
the correction to the allowed range and reports a residual outside
tolerance, so the chip flips `pending → clamped` rather than `ok`.

## Kinematic features

Every panel carries the same canonical feature set so the demo doesn't have
to explain per-panel variation:

- **J1** — vertical pivot at the right edge (CCW from outside face).
  Axis = +Z, position = (750, 0, 0) in part frame.
- **S2** — vertical mounting slot, ±10 mm travel.
  Axis = +Y in part frame.
- **P3** — four-position bolt index about Z (0°, 90°, 180°, 270°).

Allowed motion per panel:
- Translation: any axis, ≤ 10 mm norm.
- Rotation: free about Z, ≤ ±5° sweep.

Tolerances: 2 mm translation, 1° rotation.
