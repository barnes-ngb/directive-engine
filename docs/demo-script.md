# Demo Script — 5-beat walkthrough

This is the canonical narrative for the directive-engine viewer demo. The
viewer reads `datasets/toy_facade_v1/` and runs `generateDirectives()` once
on mount; the controller (`src/viewer/beat-controller.ts`) walks the user
through five beats, snapping between camera angles and panel poses. Phase 3
will layer in animation, deviation arrows, and DOF ghost geometry.

## Thesis

> The directive engine bridges detection and execution for field teams.
> Reality capture flags deviations; the engine translates each deviation
> into a directive an installer can execute, with pass/fail verification.

## The five beats

### Beat 1 — Detection

- **Scene.** All facade panels rendered at their as-built (deviated) pose.
  Panels within tolerance render in the base material. Panels outside
  tolerance are tinted: yellow for moderate deviation, red for severe
  (≥5 mm).
- **Camera.** Wide 3/4 view framing the whole subsection.
- **Headline.** "Reality doesn't match the model."
- **Action.** Click *Continue*.

### Beat 2 — Constraint

- **Scene.** Non-focused panels dim to 25% opacity; the focused panel (worst
  deviation, picked by `pickFocusedPart`) remains tinted yellow.
- **Camera.** Snaps to a close-up of the focused panel.
- **Headline.** "Every part has constraints." Subhead names the part's
  feature kinds (pivots, slots, indexed bolt patterns). Phase 3 will draw
  the actual ghost geometry; Phase 2 stops at the narrative cue.
- **Action.** *Continue* / *Back*.

### Beat 3 — Directive

- **Scene.** Same close-up as beat 2.
- **Card.** `directive-card` overlay (bottom-left) renders the
  `formatDirective()` output for the focused part. Example:
  *"Translate -3.0mm along slot S2 (Vertical mounting slot along part Y).
  Status: pending. Tolerance: ±2.0mm."*
  Chips: status (`pending`/`clamped`), Δ deviation, tolerance band.
- **Engine.** No re-computation; the directive card reads the cached
  `Step` from the `EngineBundle` built on mount.
- **Action.** *Apply* (single button — applies the directive and advances
  to beat 4). *Back* available.

### Beat 4 — Apply (simulated)

- **Scene.** Focused panel snaps to its corrected pose: nominal for
  unconstrained corrections, or as-built + clamped delta for clamped
  corrections. Tints clear.
- **Card.** Directive card remains visible for context; Apply button
  disables.
- **Headline.** "Apply the correction." Phase 3 animates this transition;
  Phase 2 is a snap.
- **Action.** *Continue* / *Back*.

### Beat 5 — Verify

- **Scene.** Camera returns to the wide shot; all panels in corrected pose.
- **Panel.** `verification-panel` overlay (bottom-right) shows two
  `metric-card`s — *Before* and *After* maximum translation deviation — and
  a `pass` chip when the after-metric falls within the tolerance band.
- **Callout.** *"This demo runs the v0.1 contract on `toy_facade_v1`. Same
  primitives drive larger installs — see the SurveyLink case study for
  adjacent aerospace-flavored work."*
- **Action.** *Restart* returns to beat 1; the controller's `reset()`
  re-emits a state change, the scene listener restores as-built poses and
  highlights, and the wide-shot camera is reset.

## State machine

`BeatController` owns the current `Beat` (1..5) and the focused part ID.
It exposes `next()`, `prev()`, `goto()`, `reset()`, and an event emitter
(`on(listener)`). All scene/DOM effects are driven by subscribers, so the
controller stays pure and testable.

The beat number is the source of truth for "applied" state — `beat >= 4`
means the panel is in its corrected pose. This keeps Back/Restart trivial:
the scene listener inspects `state.beat` and either snaps to corrected or
as-built poses.

## Open UX decisions (Phase 2)

- **Apply == Continue at beat 3.** Single button; clicking *Apply* in the
  card or *Apply* in the bottom nav both invoke the apply path and advance
  to beat 4. Two-button (separate Apply, then Continue) was rejected as
  noise.
- **Restart is a full reset.** The controller jumps to beat 1; the scene
  listener restores as-built poses, clears highlights, and resets the
  camera. No state survives a restart.
- **CSS source.** Class names (`directive-card`, `verification-panel`,
  `metric-card`, `chip`, `callout`) match the portfolio site exactly so a
  Phase 4 reconciliation can drop in the canonical styles. Phase 2 ships an
  approximation in `src/styles/overlay.css`.
