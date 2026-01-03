# Directive Engine — Scopes & Plan

## North Star
Browser-first "Installer Directive Center":
inputs (nominal + as-built + constraints) → directives → verification.

## Canonical conventions
- Units: mm
- Rotation: quat [x,y,z,w]
- Alignment: computeRigidTransform(scanPts, modelPts) returns T_model_scan so:
  apply(T_model_scan, p_scan) ≈ p_model
- Residual: r = p_model - apply(T_model_scan, p_scan) (model frame)

## Boundaries
- src/core/**: pure browser-safe logic (no Node APIs)
- demo/**: thin orchestration + UI only
- tests/**: Node OK (fs/path), but tests must not import demo/**

## Scopes
### Scope 0 — Contract & Calibration (Toy)
Schemas + toy fixture + golden tests.

### Scope 1 — Browser Demo (Toy)
Vite demo, static deploy, fetch fixtures from static root.

### Scope 2 — Museum Dataset (Anchors → Align → Mullion directives)
museum_raw + constraints + alignment RMS/residuals + conversion + directives.

### Scope 3 — Product Feel (Apply Simulation)
Simulate apply, before/after, PASS/FAIL, reset, optional simulate-all rollups.

### Scope 4 — DOF Inspector
Show constraints/DOF panel per part.

### Scope 5 — Dataset Authoring Tools
GH exporter + dataset validator + CI checks.
