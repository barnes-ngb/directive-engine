# Example: minimal CLI invocation

A 20-point synthetic scan of two vertical panel edges, demonstrating
the point-cloud ingest path end-to-end.

## Run it

```bash
npx tsx scripts/ingest-pointcloud.ts examples/minimal-scan.ply examples/minimal-parts.json
```

## Expected output

```
Parsed 20 points from examples/minimal-scan.ply
  P-01: t=[0.03, 500.00, 0.00]mm  confidence=70.0%
  P-02: t=[506.00, 500.00, 0.00]mm  confidence=70.0%
  P-01: No adjustment required (within tolerance). Status: ok. Tolerance: ±5.0mm.
  P-02: Translate -6.0mm along part-frame X. Status: pending. Tolerance: ±5.0mm.
```

(Exact values vary slightly with the PCA fit; tolerances rounded. The
printed `t=[x, y, z]` is the **as-built** pose translation in world
frame — the midpoint of the fitted line. The directive line carries
the delta vs nominal.)

## What's happening

- `minimal-scan.ply` carries 20 points: 10 along a vertical edge near the
  origin (P-01), 10 along a vertical edge near x = 506mm (P-02).
- `minimal-parts.json` declares the **nominal** lines: P-01 should sit at
  x = 0; P-02 should sit at x = 500.
- The engine segments points near each nominal line (tube radius 35mm),
  fits a line via PCA, derives a pose from the fit, and computes the
  delta vs nominal.
- P-01's points scatter within ±0.5mm of nominal → reported as OK.
- P-02's points sit 6mm off-nominal → engine emits a translate directive.

## Make your own

For your own data:

1. **Scan output → PLY/XYZ.** Most scanners export PLY natively. Most
   point-cloud tools (CloudCompare, Open3D, MeshLab) export ASCII PLY
   from any format.
2. **Decide what "nominal part line" means for your geometry.** For panel
   edges: pick a defining edge per panel. For tubes: the centerline. For
   brackets: the bolt axis. The choice constrains what the engine measures.
3. **Write `part-lines.json` with one entry per part** in the same
   coordinate frame as your scan.
4. **Run.** The CLI emits one line per part: pose estimate, confidence,
   directive.
