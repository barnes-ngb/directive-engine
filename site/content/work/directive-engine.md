---
title: "Directive Engine"
description: "Pixels to atoms: convert as-built deviations into installer-ready directives with a 5-beat 3D walkthrough and pass/fail verification."
---

# Directive Engine
## Pixels to atoms — bridge detection and execution for field teams

**One-liner:** When reality capture flags an off-nominal panel, the directive engine takes the deviation, applies the part's actual kinematic constraints (pivots, slots, indexed bolt patterns), and emits a directive an installer can execute — *pivot J1 by 0.4°, translate +3.2mm along S2* — with pass/fail verification of closure.

- Live demo: [directive-engine.vercel.app](https://directive-engine.vercel.app)
- Repo: [github.com/barnes-ngb/directive-engine](https://github.com/barnes-ngb/directive-engine)
- Demo video (60–90s): *(link added when capture lands)*

---

## The problem
When something is off in the field, the hardest part is not detecting it — it’s expressing the correction in a **field-executable format** that’s:
- unambiguous,
- constrained by what the part is *physically allowed* to do (named pivots, slots, indexed bolt patterns — not abstract axes),
- and verifiable after adjustment.

A 3.2mm translation in part-frame Y doesn’t help an installer with a wrench. *“Translate +3.2mm along slot S2”* does.

## What the demo shows

The viewer runs a five-beat guided walkthrough on the `toy_facade_v1` fixture — a 12-panel facade subsection with three panels installed off-nominal.

1. **Detection.** All panels rendered at their as-built pose. Two glow yellow, one red. Deviation arrows point from as-built toward nominal.
2. **Constraint.** Camera dollies to the worst panel. Ghost geometry reveals the part's named DOF — joint J1 (pivot), slot S2 (translation), and the forbidden directions hatched out.
3. **Directive.** A directive card renders the engine's output in installer language: *"Pivot +0.4° about J1 (CCW from outside face). Translate +3.2mm along S2. Status: pending. Tolerance: ±2.0mm."* Status chip, deviation magnitude, tolerance band.
4. **Apply (simulated).** The panel animates to its corrected pose. Tints clear. Status flips `pending → ok`.
5. **Verify.** Camera returns to the wide shot. A before/after metric card shows residual deviation dropping from ~8mm to <1mm. Pass chip.

The directive language uses the named-feature vocabulary an installer would actually use. Underlying engine math (`generateDirectives()`) is unchanged from v0.1; the presentation layer maps machine actions to physical features declared in the constraint dataset.

## Directive card format (example)
**Part:** `P-0132`  
**Action:** *Pivot +0.4° about J1 (CCW from outside face). Translate +3.2mm along S2.*  
**Frame:** part-local (features declared in `constraints.json`)  
**Tolerances:** ±2.0mm translation, ±1.0° rotation  
**Status:** `pending` → `ok` after apply  
**Verify:** before/after deviation metric, with a `pass` chip when within tolerance

## What makes this different
- **Contracts-first.** Explicit JSON Schemas for as-built input, constraints (with optional named features), and directives output. The engine output is identical with or without features declared — features are pure presentation metadata.
- **Constraint-aware.** Directives respect allowed DOF and discrete indexing. A correction that doesn't fit gets `clamped` or `blocked`, not silently rounded.
- **Verification loop.** Pass/fail isn't just "what to do" — it's *how to confirm it worked*, with a before/after delta the demo shows on screen.
- **Installer-vocabulary output.** *"Pivot about J1"* — not *"rotate Z"*. The mapping happens in `src/presentation/format-directive.ts`; the engine stays generic.

## Why this generalizes

The `toy_facade_v1` fixture is synthetic AEC-prefab geometry, but the primitives — pose representation as `T_world_part` with a quaternion, DOF projection onto declared kinematic features, indexed-rotation quantization, tolerance clamping — are the same primitives that drive larger installs in adjacent domains.

For aerospace-flavored work using these same patterns at scale, see the [SurveyLink case study](/work/surveylink). The directive engine is the *generation* half (deviation → instruction); SurveyLink is the *capture* half (as-built reality → deviation).

## Roadmap (pragmatic)
- Step ordering / dependencies (anchors → part → verification)
- Confidence scoring + `needs_review` flags surfaced in the UI
- Tolerance heatmaps to spot systemic drift across a facade
- Real scan-data ingestion (the demo currently runs on a synthetic fixture)
- AR overlay as an output target, not the core product

## Honest framing

This is a prototype running on a synthetic fixture. The engine is real (DOF projection, indexed rotation quantization, status logic) and unit-tested; the geometry and deviations are designed to exercise the contract end-to-end. Same primitives generalize to larger installs.
