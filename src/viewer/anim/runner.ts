/**
 * Lightweight animation runner. Holds a set of active tweens keyed by an
 * identifier so a re-issued tween (e.g., user advances beats quickly) cleanly
 * replaces the previous one and lands at the correct end state.
 *
 * Drives the per-frame `onUpdate` callback with a normalized t ∈ [0, 1]; the
 * caller decides how to apply the sampled state. On completion or
 * cancellation the runner calls `onUpdate(1)` so end-state correctness is
 * guaranteed regardless of frame timing.
 */

export type AnimTickFn = (t: number) => void;

interface ActiveAnim {
  key: string;
  start: number;
  duration: number;
  onUpdate: AnimTickFn;
  onComplete?: () => void;
}

export interface AnimRunStartOptions {
  /** Stable identifier — replaces any active tween with the same key. */
  key: string;
  /** Duration in ms. */
  durationMs: number;
  /** Called every frame with `t ∈ [0, 1]`. Must apply the sampled state. */
  onUpdate: AnimTickFn;
  /** Optional completion hook, invoked once after the final onUpdate(1). */
  onComplete?: () => void;
}

export class AnimRunner {
  private readonly active = new Map<string, ActiveAnim>();
  private readonly now: () => number;

  constructor(nowFn: () => number = () => performance.now()) {
    this.now = nowFn;
  }

  /**
   * Start (or replace) a tween. If `durationMs <= 0`, the tween runs once at
   * t=1 and completes immediately — useful for "snap" fallbacks.
   */
  start(opts: AnimRunStartOptions): void {
    if (opts.durationMs <= 0) {
      opts.onUpdate(1);
      opts.onComplete?.();
      this.active.delete(opts.key);
      return;
    }
    this.active.set(opts.key, {
      key: opts.key,
      start: this.now(),
      duration: opts.durationMs,
      onUpdate: opts.onUpdate,
      onComplete: opts.onComplete,
    });
  }

  /** Cancel the tween with this key without finalizing. */
  cancel(key: string): boolean {
    return this.active.delete(key);
  }

  /** Cancel the tween, but call `onUpdate(1)` so it lands at the end state. */
  finalize(key: string): boolean {
    const a = this.active.get(key);
    if (!a) return false;
    a.onUpdate(1);
    a.onComplete?.();
    return this.active.delete(key);
  }

  /** Cancel every active tween without finalizing. */
  cancelAll(): void {
    this.active.clear();
  }

  /** True if any tween with this key is currently running. */
  has(key: string): boolean {
    return this.active.has(key);
  }

  /** Tick called once per render frame. Advances every active tween. */
  tick(): void {
    if (this.active.size === 0) return;
    const now = this.now();
    // Snapshot keys: completion callbacks may mutate the map.
    const keys = [...this.active.keys()];
    for (const key of keys) {
      const a = this.active.get(key);
      if (!a) continue;
      const t = Math.min(1, (now - a.start) / a.duration);
      a.onUpdate(t);
      if (t >= 1) {
        this.active.delete(key);
        a.onComplete?.();
      }
    }
  }
}
