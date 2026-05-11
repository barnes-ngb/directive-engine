/**
 * Five-beat narrative state machine for the directive-engine demo.
 *
 * Pure controller: holds the current beat and the focused part ID, exposes
 * `next()` / `prev()` / `goto()` / `reset()`, and emits change events. No DOM
 * or Three.js access — the scene and overlay subscribe and apply effects.
 *
 * The five beats:
 *   1. Detection   — deviated panels highlighted in nominal scene
 *   2. Constraint  — camera focused on a single panel; DOFs called out
 *   3. Directive   — directive card visible for the focused panel
 *   4. Apply       — panel snapped to corrected pose
 *   5. Verify      — before/after metric and pass chip
 *
 * Beat is the single source of truth for "applied" state: beat >= 4 means
 * the correction has been applied (scene shows corrected pose); beat < 4
 * means original as-built pose. This keeps the controller minimal and lets
 * Back/Restart unwind cleanly.
 */

export type Beat = 1 | 2 | 3 | 4 | 5;

export const FIRST_BEAT: Beat = 1;
export const LAST_BEAT: Beat = 5;

export interface BeatState {
  /** Current narrative beat (1..5). */
  beat: Beat;
  /** Part ID the demo is currently zoomed on; null in beat 1. */
  focusedPartId: string | null;
}

export type BeatListener = (current: BeatState, previous: BeatState) => void;

export interface BeatControllerOptions {
  /** Part ID to focus from beat 2 onward. May be null if no deviated part. */
  focusedPartId: string | null;
  initialBeat?: Beat;
}

function isBeat(n: number): n is Beat {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

/**
 * Five-beat controller. Mutable state, immutable snapshots exposed via
 * `current`. Subscribe with `on()` to receive every transition.
 */
export class BeatController {
  private state: BeatState;
  private readonly listeners = new Set<BeatListener>();

  constructor(opts: BeatControllerOptions) {
    const initial = opts.initialBeat ?? FIRST_BEAT;
    if (!isBeat(initial)) {
      throw new Error(`Invalid initial beat: ${initial}`);
    }
    this.state = {
      beat: initial,
      focusedPartId: opts.focusedPartId,
    };
  }

  /** Snapshot of current state. Safe to retain — does not alias internal state. */
  get current(): BeatState {
    return { ...this.state };
  }

  /** Subscribe to transitions. Returns an unsubscribe function. */
  on(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Advance to next beat. Returns true if a transition occurred. */
  next(): boolean {
    return this.goto((this.state.beat + 1) as Beat);
  }

  /** Back up one beat. Returns true if a transition occurred. */
  prev(): boolean {
    return this.goto((this.state.beat - 1) as Beat);
  }

  /** Jump directly to a beat. Returns true if a transition occurred. */
  goto(beat: number): boolean {
    if (!isBeat(beat)) return false;
    if (beat === this.state.beat) return false;
    const previous = this.state;
    this.state = { ...this.state, beat };
    this.emit(this.state, previous);
    return true;
  }

  /** Return to beat 1 (full restart). Emits a change if not already at 1. */
  reset(): void {
    this.goto(FIRST_BEAT);
  }

  /** True iff `next()` would transition. */
  canAdvance(): boolean {
    return this.state.beat < LAST_BEAT;
  }

  /** True iff `prev()` would transition. */
  canGoBack(): boolean {
    return this.state.beat > FIRST_BEAT;
  }

  /** True iff the correction is considered "applied" (beat 4 or 5). */
  isApplied(): boolean {
    return this.state.beat >= 4;
  }

  private emit(current: BeatState, previous: BeatState): void {
    for (const l of this.listeners) {
      l({ ...current }, { ...previous });
    }
  }
}
