# Phase 9 — Diagnosis

Two bugs surfaced in the user's audit of the live demo at
`directive-engine.vercel.app/`:

1. **Beat 1 → Continue jumps to Beat 3, skipping Beat 2.**
2. **Beat 4 (Apply) does not visibly update the directive card** —
   status stays `pending`, deviation chip stays `Δ 6.6mm`.

The two have **different root causes**.

## Bug 1: Beat 2 skip

### Root cause

`src/viewer/overlay/beat-nav.ts` registers **two click handlers** on the
forward (Continue / Apply / Restart) button: one via `addEventListener`
in the `button()` factory at construction time, and one via the `onclick`
property re-assigned every `render()`.

The factory:

```ts
function button(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  ...
  btn.addEventListener("click", onClick);  // permanent listener #1
  return btn;
}
```

Then in `render()`:

```ts
const forwardBtn = button("Continue", () => cb.onContinue());  // #1 ↑
...
forwardBtn.onclick = () => cb.onContinue();  // listener #2
```

Both listeners fire on every click. On Beat 1, a single Continue click
invokes `controller.next()` twice → Beat 1 → 2 → 3 in one frame. The
viewer never settles on Beat 2 long enough to render.

The same double-fire happens at Beat 2 (would go 2 → 4) and at Beat 4
(would go 4 → 5 inadvertently), but the user's first noticed symptom is
the 1 → 3 skip because Beat 2 is where the demo's pedagogical "why" lives.

At Beat 3 (Apply) and Beat 5 (Restart), the double-fire is partially
masked: the property handler invokes `onApply` / `onRestart`, which both
end in a `controller.goto(4)` / `controller.reset()` that's idempotent
relative to the parallel `next()` from the addEventListener handler. So
the user didn't see a symptom there — but the bug is the same.

The `BeatController` itself is correct — its unit tests all pass and
exercise `next()`/`prev()`/`goto()` thoroughly. The bug is purely at the
overlay-DOM layer.

### Fix

Stop double-binding. Drop the `addEventListener` from the forward button
and keep a single dispatch via a mutable closure. The back button keeps
its simple `addEventListener` since its callback never changes.

## Bug 2: Beat 4 state staleness

### Root cause

`src/viewer/overlay/directive-card.ts`'s `render(step, constraint)`
renders chips directly from the `Step` object emitted by
`generateDirectives()`:

- status chip ← `step.status` (always `"pending"` for the focused part)
- delta chip ← `step.computed_errors.translation_error_norm_mm` (always
  the pre-apply deviation, e.g. `6.6mm`)

The card has no awareness of the current beat, and the engine's `Step` is
a directive — it doesn't mutate when the directive is "applied" in the
demo's simulated sense. So at Beat 4 the card re-renders the same
pre-apply values it showed at Beat 3.

This is a separate bug from Bug 1; it would persist even if Beat 2 were
not skipped.

The data needed for the post-apply view already exists on the `Step`:
`step.verification[0].expected_residual.translation_mm_vec` is the
residual translation after applying the directive (zero for `pending`
status, the clamped leftover for `clamped` status). The norm of that
vector is the post-apply delta the card should display at Beat 4.

### Fix

Add an `applied: boolean` parameter to `directive-card.render()`. When
`applied`:

- status chip → `chip--ok` with text `ok`
- delta chip → residual norm from `verification[0].expected_residual`
  (formatted to 1 decimal, falls back to `0.0mm` if missing)
- Apply button → disabled, text `Applied`

Update `overlay/index.ts` to pass `applied: beat === 4` when rendering.
Beats 1-3 keep the existing pre-apply rendering.

## Bug 3 (sanity check): Beat 5 metrics

The verification panel's before/after numbers come from
`bundle.beforeMaxDeviationMm` and `bundle.afterMaxDeviationMm`, computed
once in `engine-bridge.ts` from `step.computed_errors.translation_error_norm_mm`
(before) and `step.verification[0].expected_residual.translation_mm_vec`
(after). These are static post-engine-run values and are correct
regardless of beat — they represent "before correction" vs "after
correction" by definition, not "current state". No fix needed.

## Test gap

The existing `beat-controller.test.ts` tests the controller in isolation
and passes. It cannot catch Bug 1 because the bug is in the overlay's
event wiring, not the controller. We need an overlay-level walkthrough
test that simulates clicks on the Continue button and asserts the
controller's state after each click — that catches the double-fire.
