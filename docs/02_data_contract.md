# Data Contract

This project is contracts-first. The viewer/engine can be implemented in any language as long as it conforms to these schemas.

---

## Coordinate frames (MVP)
Minimum viable frames:
- **world**: dataset global frame (site grid / scan frame)
- **part**: local frame of the part

All transforms are translation + quaternion.

### Transform representation
```json
{
  "t": [0, 0, 0],
  "q": [0, 0, 0, 1]
}
```

- `t`: translation in dataset units (mm recommended)
- `q`: quaternion `[x, y, z, w]`

---

## Files
- `datasets/toy_facade_v1/nominal.json` — nominal poses (`T_world_part_nominal`)
- `datasets/toy_facade_v1/as_built.json` — observed as-built poses (`T_world_part_asBuilt`)
- `datasets/toy_facade_v1/constraints.json` — constraints per part
- output: `directives.json` — directives + verification

---

## Core computation
For each part:

- correction transform:
  `T_correction = inverse(T_world_part_asBuilt) * T_world_part_nominal`

Then:
- project translation onto allowed axes
- clamp magnitude to allowed max
- quantize rotation if `allowedRotation.type = "index"`

---

## Verification
Minimum viable:
- show a “before” deviation metric
- apply correction (simulated) and compute “after”
- pass if after ≤ tolerance

The metric can be simple for MVP (e.g., translation norm).
