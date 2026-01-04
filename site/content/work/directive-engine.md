---
title: "Directive Engine"
description: "Turn as-built deltas into step-by-step installer directives with a viewer + verification."
---

# Directive Engine
## Align reality to intent → generate steps crews can execute

**One-liner:** Convert nominal ↔ as-built deltas into **installer-ready directive cards** (move/rotate/index), with visualization and verification.

- Demo video (60–90s): **https://www.youtube.com/@directive-engine**
- Repo: **https://github.com/directive-engine/directive-engine**
- Contact: **hello@directive.engine**

---

## The problem
When something is off in the field, the hardest part is not detecting it — it’s expressing the correction in a **field-executable format** that’s:
- unambiguous,
- constrained by what’s physically allowed,
- and verifiable after adjustment.

## What the demo shows
1) Load nominal + as-built dataset  
2) Compute the correction needed to bring parts back to nominal  
3) Generate a **directive card** per part  
4) Visualize the correction (gizmo / arrows)  
5) Export directives (JSON/CSV)  
6) Verify closure with a before/after metric

## Directive card format (example)
**Part:** `P-0132`  
**Action:** translate + rotate index  
**Frame:** part-local (or site grid)  
**Tolerances:** ±2mm translation, ±1° rotation  
**Verify:** deviation after < 2mm

> Notes: “Loosen anchors A/B, shim behind bracket, re-torque to spec.”

## What makes this different
- **Contracts-first:** explicit schemas for as-built input, constraints, and directives output.
- **Constraints-aware:** directives respect allowed DOF and discrete indexing where applicable.
- **Verification loop:** not just “what to do,” but “how to confirm it worked.”

## Roadmap (pragmatic)
- Step ordering / dependencies (anchors → part → verification)
- Confidence scoring + “needs human review” flags
- Tolerance heatmaps / clustering (spot systemic drift)
- Optional: AR overlay as a *skin*, not the core product
