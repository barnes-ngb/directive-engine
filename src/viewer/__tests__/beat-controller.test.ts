import { describe, expect, it, vi } from "vitest";
import { BeatController, FIRST_BEAT, LAST_BEAT } from "../beat-controller.js";

describe("BeatController", () => {
  it("starts at beat 1 by default", () => {
    const c = new BeatController({ focusedPartId: "P-0001" });
    expect(c.current.beat).toBe(FIRST_BEAT);
    expect(c.current.focusedPartId).toBe("P-0001");
  });

  it("accepts a non-default initial beat", () => {
    const c = new BeatController({ focusedPartId: null, initialBeat: 3 });
    expect(c.current.beat).toBe(3);
  });

  it("advances through all five beats with next()", () => {
    const c = new BeatController({ focusedPartId: "P-0001" });
    for (let i = 2; i <= LAST_BEAT; i++) {
      expect(c.next()).toBe(true);
      expect(c.current.beat).toBe(i);
    }
    // Past the last beat is a no-op.
    expect(c.next()).toBe(false);
    expect(c.current.beat).toBe(LAST_BEAT);
  });

  it("walks backward with prev() and refuses to go below 1", () => {
    const c = new BeatController({ focusedPartId: "P-0001", initialBeat: 3 });
    expect(c.prev()).toBe(true);
    expect(c.current.beat).toBe(2);
    expect(c.prev()).toBe(true);
    expect(c.current.beat).toBe(1);
    expect(c.prev()).toBe(false);
    expect(c.current.beat).toBe(1);
  });

  it("goto() ignores out-of-range and same-beat values", () => {
    const c = new BeatController({ focusedPartId: null });
    expect(c.goto(0)).toBe(false);
    expect(c.goto(6)).toBe(false);
    expect(c.goto(1)).toBe(false); // same beat
    expect(c.goto(4)).toBe(true);
    expect(c.current.beat).toBe(4);
  });

  it("emits change events with previous and current states", () => {
    const c = new BeatController({ focusedPartId: "P-0001" });
    const listener = vi.fn();
    c.on(listener);
    c.next();
    expect(listener).toHaveBeenCalledTimes(1);
    const [current, previous] = listener.mock.calls[0];
    expect(previous.beat).toBe(1);
    expect(current.beat).toBe(2);
  });

  it("emitted states are snapshots, not aliases", () => {
    const c = new BeatController({ focusedPartId: null });
    const captures: Array<{ beat: number }> = [];
    c.on((current) => {
      captures.push({ ...current });
    });
    c.next();
    c.next();
    // Captured object reflects beat 2, not the later beat 3 mutation.
    expect(captures[0]?.beat).toBe(2);
    expect(captures[1]?.beat).toBe(3);
  });

  it("unsubscribe stops further notifications", () => {
    const c = new BeatController({ focusedPartId: null });
    const listener = vi.fn();
    const off = c.on(listener);
    c.next();
    off();
    c.next();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset() returns to beat 1 and emits a change", () => {
    const c = new BeatController({ focusedPartId: "P-0001", initialBeat: 4 });
    const listener = vi.fn();
    c.on(listener);
    c.reset();
    expect(c.current.beat).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset() from beat 1 is a no-op", () => {
    const c = new BeatController({ focusedPartId: null });
    const listener = vi.fn();
    c.on(listener);
    c.reset();
    expect(listener).not.toHaveBeenCalled();
  });

  it("isApplied reflects beat >= 4", () => {
    const c = new BeatController({ focusedPartId: "P-0001" });
    expect(c.isApplied()).toBe(false);
    c.goto(3);
    expect(c.isApplied()).toBe(false);
    c.goto(4);
    expect(c.isApplied()).toBe(true);
    c.goto(5);
    expect(c.isApplied()).toBe(true);
  });

  it("canAdvance / canGoBack reflect boundary state", () => {
    const c = new BeatController({ focusedPartId: null });
    expect(c.canAdvance()).toBe(true);
    expect(c.canGoBack()).toBe(false);
    c.goto(5);
    expect(c.canAdvance()).toBe(false);
    expect(c.canGoBack()).toBe(true);
  });

  it("current returns a fresh snapshot", () => {
    const c = new BeatController({ focusedPartId: "P-0001" });
    const a = c.current;
    a.beat = 9 as 1; // mutate the snapshot
    expect(c.current.beat).toBe(1);
  });
});
