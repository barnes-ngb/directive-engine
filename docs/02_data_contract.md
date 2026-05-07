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

---

## Named kinematic features (optional)

A `PartConstraint` may declare a `features` array describing the part's
*named* joints, slots, and indexed bolt patterns in part frame. Features are
**presentation metadata**: the engine ignores them. The presentation layer
uses them to render directives in installer language — *"Pivot 0.4° about J1.
Translate +3.2mm along S2."* — instead of generic axis names.

All feature coordinates are in **part frame** (mm). The `axis` field need not
be unit-length; formatters normalize it. For slots, the sign of `axis` defines
the positive direction reported in directives.

### Joint
A pivot point + rotation axis (one rotational DOF).
```json
{
  "id": "J1",
  "kind": "joint",
  "position_mm": [0, 0, 0],
  "axis": [1, 0, 0],
  "description": "Hinge about part X (CCW from outside face)"
}
```

### Slot
A translation axis (one translational DOF).
```json
{
  "id": "S2",
  "kind": "slot",
  "position_mm": [0, 0, 0],
  "axis": [0, 1, 0],
  "description": "Vertical mounting slot along part Y"
}
```

### Index pattern
A discrete rotational pattern (e.g., 4-position bolt pattern).
```json
{
  "id": "I1",
  "kind": "index",
  "position_mm": [0, 0, 0],
  "axis": [0, 0, 1],
  "count": 4,
  "description": "Four-position detent about part Z"
}
```

### Compatibility
- `features` is optional. Omitting it changes nothing — the engine produces
  identical output and the presentation layer falls back to part-frame
  language (e.g., *"Translate +3.2mm along part-frame Y"*).
- v0.2 supports single-kind features only. A part may declare multiple
  features of different kinds (e.g., a joint **and** an index pattern), but
  no compound joint+index entry.
