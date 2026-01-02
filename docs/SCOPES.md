# Directive Engine — Agent Plan & Scopes

This document defines **what we are building**, **what we are not building**, and the **scopes/milestones** used to keep work consistent across chats, branches, and contributors.

---

## North Star

Build a browser-first **Installer Directive Center** ("instrument") that turns:
**as-built evidence + constraints** → **installer-ready directives** → **verification**.

The demo must run from static hosting on any device.

---

## Principles

1) **Instrument-first**
- Deterministic, testable, repeatable.
- Calibrated by fixtures (toy dataset + golden tests).

2) **Browser-first**
- `src/core/**` contains **no Node APIs**.
- Demo is static deployable (`dist/` output).

3) **Contracts-first**
- Schemas and datasets define the interface.
- Any semantic change requires a Change Proposal + updated fixtures/tests.

4) **Thin UI**
- Demo/UI is an orchestration layer.
- Core logic lives in `src/core/**`.

---

## Canonical Conventions

### Units and pose representation
- Translation: mm
- Rotation: quaternion `[x, y, z, w]`
- Pose: `T_world_part` = pose of part frame in world.

### Alignment direction (anchors)
`computeRigidTransform(scanPts, modelPts)` returns `T_model_scan` such that:

> `p_model ≈ apply(T_model_scan, p_scan)`

Residuals are in model frame:

> `r = p_model - apply(T_model_scan, p_scan)`

### Constraints / DOF ("movement")
"Movement" means **allowed degrees of freedom**, represented in constraints:
- `allowed_translation_axes`
- `translation_max_abs_mm` / `translation_max_norm_mm`
- `rotation_mode` + `allowed_rotation_axes` (+ `index_rotation` if used)
- tolerances + confidence threshold

---

## Repo Structure & Boundaries

### Core (browser-safe)
`src/core/**`
- directive generation
- alignment math
- conversion utilities
- simulation/verification helpers
- types shared across demo + tests

**Non-goal:** Node builtins in core.

### Demo/UI (thin)
`demo/**` and/or `src/web/**`
- fetch JSON fixtures
- show dataset selector
- render directive cards
- show alignment panel
- apply simulation UI

**Non-goal:** demo-local alignment solvers, demo-local conversion logic (move to core).

### Fixtures & schemas
- `schemas/**` JSON schemas
- `datasets/**` canonical fixture files (toy + museum)
- build pipeline must copy required JSONs into static output (`dist/`)

### Tests
- Prefer Vitest under `src/__tests__/**`
- Tests may use Node builtins (fs/path) only inside test files.
- Tests should not import from `demo/**`.

---

## Scopes (Milestones)

Each scope has:
- Goal
- Deliverables
- Non-goals
- Definition of Done (DoD)

### Scope 0 — Contract & Calibration (Toy)
**Goal:** lock v0.1 semantics and deterministic outputs.

**Deliverables**
- v0.1 schemas (poses, constraints, directives)
- toy dataset fixture
- golden test (machine fields, tolerant floats)

**Non-goals**
- museum integration
- alignment

**DoD**
- `npm test` passes on clean install
- toy golden test prevents drift

---

### Scope 1 — Browser Demo (Toy)
**Goal:** run engine in browser, static deploy.

**Deliverables**
- Vite demo (dev/build/preview)
- dataset fetch by exact filenames at static root
- directive cards rendering

**Non-goals**
- AR, full 3D visualization

**DoD**
- `npm run build` produces dist/
- demo works in preview and on deployed static host

---

### Scope 2 — Museum Dataset Plumbing (Anchors + Mullions)
**Goal:** real dataset: museum_raw + constraints → align → convert → directives.

**Deliverables**
- museum dataset files in `datasets/museum_facade_v0_1/**`
- dataset selector: Toy/Museum
- alignment panel: RMS + residual table (sorted)
- conversion: line midpoint → v0.1 poses (rotation identity MVP)
- museum contract test (core-only imports)

**Non-goals**
- per-part alignment, ICP point clouds
- kinked mullion geometry beyond chord-line MVP

**DoD**
- museum works end-to-end in deployed demo
- tests cover museum conversion + alignment + directive generation

---

### Scope 3 — Product Feel (Apply Simulation + Verification)
**Goal:** close the loop: before/after + PASS/FAIL.

**Deliverables**
- core simulation helper: apply actions to pose and recompute error
- UI "Simulate Apply" and "Reset"
- optional "Simulate All" rollups

**Non-goals**
- full physics, bolts/torque models
- AR

**DoD**
- UI demonstrates before/after and PASS/FAIL reliably
- simulation unit tests pass on toy dataset

---

### Scope 4 — DOF Inspector (Constraints Panel)
**Goal:** make DOF explicit to users.

**Deliverables**
- read-only constraints panel on directive card
- show axes, limits, tolerances, confidence threshold

**Non-goals**
- authoring constraints in UI

**DoD**
- reviewers immediately understand clamped/blocked/needs_review reasoning

---

### Scope 5 — Dataset Authoring Tools (GH Export + Validation)
**Goal:** stable dataset export and safety checks.

**Deliverables**
- GH C# exporter (museum_raw + museum_constraints)
- museum_raw schema + validator script
- CI checks for dataset validity

**Non-goals**
- automated scan feature extraction

**DoD**
- export → validate → demo works repeatably

---

## Implementation Status

_Last updated: 2026-01-02_

| Scope | Status | Notes |
|-------|--------|-------|
| **0** | ✅ Complete | v0.1 schemas in `schemas/`, toy fixtures in `datasets/toy_v0_1/`, golden test passing |
| **1** | ✅ Complete | Vite build produces `dist/`, demo runs on static host |
| **2** | ✅ Complete | Museum dataset loads, alignment panel with RMS + residuals, dataset selector works |
| **3** | ✅ Complete | `simulateStep()` in core, UI has Simulate/Reset/Reset All buttons |
| **4** | ✅ Complete | Constraints panel shows axes, limits, tolerances on each directive card |
| **5** | 🟡 Partial | GH exporter exists (`convert.gh`), missing: validation script, CI checks |

**Test health:** 77 tests passing (14 test files)
**Build health:** Clean build, ~32KB JS + 6KB CSS output

---

## Change Control

Any change to contract semantics must:
1) add a **Change Proposal** section
2) update schemas if applicable
3) update fixture(s) + expected output
4) update tests

---

## Work Method (Chats, Tasks, Summaries)

### Master chat
- owns canonical decisions
- chooses next 3 tasks
- accepts/rejects change proposals

### Subchat (execution)
- runs exactly one patch-sized task
- ends with "Return to Master" summary

### Return to Master format
```md
## Return to Master — <Task Name>
**Goal:** …
**Assumptions:** …
**Delivered:**
- Files added/changed: …
- Behavior implemented: …
- Tests added/updated: …
**Change Proposals (if any):**
- …
**How to verify locally:**
- …
**Open questions / risks:**
- …
**Next 3 tasks:**
1)
2)
3)
```
