# Overview — Directive Engine

## Goal
Turn an as-built observation of parts (poses + confidence) into a set of step-by-step directives that a field team can execute.

## Core loop
1. **Input**
   - nominal model (parts with stable IDs)
   - as-built observations (poses)
   - constraints (allowed DOF, tolerances, indexing rules)

2. **Compute**
   - correction transforms that move as-built → nominal
   - project corrections onto allowed DOF
   - quantize rotations (indexing) where needed

3. **Output**
   - directive cards (human-readable steps)
   - machine-readable directive JSON/CSV
   - verification rules + metrics

4. **Verify**
   - before/after deviation metrics to confirm closure

## What this is / isn’t (MVP)
**Is:**
- contracts-first, dataset-driven
- demoable and visual
- focused on directives + verification

**Is not (yet):**
- full scan registration from raw point clouds
- full AR product
- complex scheduling/ERP integrations
