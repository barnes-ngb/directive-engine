import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  noopTracer,
  createTracer,
  createCollectorTracer,
  mergeTracers
} from "../core/trace.js";
import type { Action, Step } from "../types.js";

describe("noopTracer", () => {
  it("has no methods defined (zero overhead)", () => {
    // noopTracer should be an empty object
    assert.equal(Object.keys(noopTracer).length, 0);
  });

  it("can be called without error", () => {
    // These should not throw
    noopTracer.onPartStart?.("P1", "Part 1");
    noopTracer.onErrorsComputed?.("P1", 1.5, 2.0);
    noopTracer.onStatusDetermined?.("P1", "pending", ["test"]);
  });
});

describe("createTracer", () => {
  it("logs to the provided function", () => {
    const logs: string[] = [];
    const tracer = createTracer((msg) => logs.push(msg));

    tracer.onPartStart?.("P1", "Part 1");
    tracer.onErrorsComputed?.("P1", 1.5, 2.0);
    tracer.onStatusDetermined?.("P1", "pending", ["test"]);

    assert.equal(logs.length, 3);
    assert.ok(logs[0].includes("P1"));
    assert.ok(logs[0].includes("Part 1"));
    assert.ok(logs[1].includes("1.500mm"));
    assert.ok(logs[1].includes("2.000°"));
    assert.ok(logs[2].includes("pending"));
  });

  it("logs clamp events with formatted values", () => {
    const logs: string[] = [];
    const tracer = createTracer((msg) => logs.push(msg));

    tracer.onClampApplied?.("P1", "translation", [10, 20, 30], [5, 10, 15]);
    tracer.onClampApplied?.("P1", "rotation", 45, 30);

    assert.equal(logs.length, 2);
    assert.ok(logs[0].includes("translation"));
    assert.ok(logs[0].includes("[10.00, 20.00, 30.00]"));
    assert.ok(logs[0].includes("[5.00, 10.00, 15.00]"));
    assert.ok(logs[1].includes("rotation"));
    assert.ok(logs[1].includes("45.00"));
    assert.ok(logs[1].includes("30.00"));
  });

  it("logs complete summary", () => {
    const logs: string[] = [];
    const tracer = createTracer((msg) => logs.push(msg));

    tracer.onComplete?.(5, { ok: 2, pending: 2, clamped: 1, blocked: 0, needs_review: 0 });

    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("5 steps"));
    assert.ok(logs[0].includes("ok=2"));
    assert.ok(logs[0].includes("pending=2"));
    assert.ok(logs[0].includes("clamped=1"));
    // Should not include blocked=0 since count is 0
  });
});

describe("createCollectorTracer", () => {
  it("collects events into an array", () => {
    const { tracer, getEvents } = createCollectorTracer();

    tracer.onPartStart?.("P1", "Part 1");
    tracer.onErrorsComputed?.("P1", 1.5, 2.0);

    const events = getEvents();
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "part_start");
    assert.equal(events[0].data.partId, "P1");
    assert.equal(events[1].type, "errors_computed");
  });

  it("can be cleared", () => {
    const { tracer, getEvents, clear } = createCollectorTracer();

    tracer.onPartStart?.("P1", "Part 1");
    assert.equal(getEvents().length, 1);

    clear();
    assert.equal(getEvents().length, 0);
  });

  it("returns copies of events array", () => {
    const { tracer, getEvents } = createCollectorTracer();

    tracer.onPartStart?.("P1", "Part 1");
    const events1 = getEvents();
    tracer.onPartStart?.("P2", "Part 2");
    const events2 = getEvents();

    assert.equal(events1.length, 1);
    assert.equal(events2.length, 2);
  });

  it("includes timestamps", () => {
    const { tracer, getEvents } = createCollectorTracer();
    const before = Date.now();
    tracer.onPartStart?.("P1", "Part 1");
    const after = Date.now();

    const events = getEvents();
    assert.ok(events[0].timestamp >= before);
    assert.ok(events[0].timestamp <= after);
  });
});

describe("mergeTracers", () => {
  it("calls all tracers for each event", () => {
    const logs1: string[] = [];
    const logs2: string[] = [];
    const tracer1 = createTracer((msg) => logs1.push(msg));
    const tracer2 = createTracer((msg) => logs2.push(msg));

    const merged = mergeTracers(tracer1, tracer2);

    merged.onPartStart?.("P1", "Part 1");

    assert.equal(logs1.length, 1);
    assert.equal(logs2.length, 1);
    assert.equal(logs1[0], logs2[0]);
  });

  it("handles empty tracer list", () => {
    const merged = mergeTracers();
    // Should not throw
    merged.onPartStart?.("P1", "Part 1");
  });

  it("handles noopTracer in merge", () => {
    const logs: string[] = [];
    const tracer = createTracer((msg) => logs.push(msg));
    const merged = mergeTracers(noopTracer, tracer, noopTracer);

    merged.onPartStart?.("P1", "Part 1");

    assert.equal(logs.length, 1);
  });
});

describe("tracer with full step lifecycle", () => {
  it("traces a complete step", () => {
    const { tracer, getEvents } = createCollectorTracer();

    // Simulate what generateDirectives would do
    tracer.onPartStart?.("P1", "Panel-A");
    tracer.onErrorsComputed?.("P1", 5.0, 3.0);
    tracer.onStatusDetermined?.("P1", "pending", ["translation_out_of_tolerance"]);

    const action: Action = {
      action_id: "A1",
      type: "translate",
      description: "Translate Panel-A to nominal"
    };
    tracer.onActionGenerated?.("P1", action);

    const step: Step = {
      step_id: "S1",
      part_id: "P1",
      status: "pending",
      reason_codes: ["translation_out_of_tolerance"],
      computed_errors: {
        translation_error_mm_vec: [5, 0, 0],
        translation_error_norm_mm: 5,
        rotation_error_deg: 3
      },
      actions: [action],
      verification: []
    };
    tracer.onStepComplete?.(step);

    const events = getEvents();
    assert.equal(events.length, 5);
    assert.equal(events[0].type, "part_start");
    assert.equal(events[1].type, "errors_computed");
    assert.equal(events[2].type, "status_determined");
    assert.equal(events[3].type, "action_generated");
    assert.equal(events[4].type, "step_complete");
  });
});
