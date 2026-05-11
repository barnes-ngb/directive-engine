import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { easeInOutQuad, linear } from "../anim/easing.js";
import {
  sampleCameraTween,
  type CameraWaypoint,
} from "../anim/camera-tween.js";
import {
  poseToState,
  samplePanelTween,
} from "../anim/panel-tween.js";
import { sampleArrowTween } from "../anim/arrow-tween.js";
import { AnimRunner } from "../anim/runner.js";

describe("easing", () => {
  it("linear is the identity on [0, 1] and clamps outside", () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
    expect(linear(-0.5)).toBe(0);
    expect(linear(1.5)).toBe(1);
  });

  it("easeInOutQuad pins 0, 0.5, 1 to canonical values", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutQuad(1)).toBe(1);
  });

  it("easeInOutQuad is monotonic non-decreasing", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOutQuad(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("sampleCameraTween", () => {
  const from: CameraWaypoint = {
    position: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
  };
  const to: CameraWaypoint = {
    position: new THREE.Vector3(10, 20, 30),
    target: new THREE.Vector3(100, 200, 300),
  };

  it("at t=0 returns the from waypoint", () => {
    const s = sampleCameraTween(from, to, 0);
    expect(s.position.toArray()).toEqual([0, 0, 0]);
    expect(s.target.toArray()).toEqual([0, 0, 0]);
  });

  it("at t=1 lands exactly on the to waypoint", () => {
    const s = sampleCameraTween(from, to, 1);
    expect(s.position.toArray()).toEqual([10, 20, 30]);
    expect(s.target.toArray()).toEqual([100, 200, 300]);
  });

  it("at t=0.5 with linear easing is midpoint", () => {
    const s = sampleCameraTween(from, to, 0.5, linear);
    expect(s.position.x).toBeCloseTo(5, 6);
    expect(s.target.x).toBeCloseTo(50, 6);
  });

  it("returns fresh vectors that do not alias inputs", () => {
    const s = sampleCameraTween(from, to, 0.5);
    s.position.set(999, 999, 999);
    expect(from.position.toArray()).toEqual([0, 0, 0]);
    expect(to.position.toArray()).toEqual([10, 20, 30]);
  });
});

describe("samplePanelTween", () => {
  const from = poseToState({ t: [0, 0, 0], q: [0, 0, 0, 1] });
  // 90° rotation about Z
  const halfRoot2 = Math.sqrt(2) / 2;
  const to = poseToState({ t: [100, 0, 0], q: [0, 0, halfRoot2, halfRoot2] });

  it("at t=0 returns the from state", () => {
    const s = samplePanelTween(from, to, 0);
    expect(s.position.toArray()).toEqual([0, 0, 0]);
    expect(s.quaternion.w).toBeCloseTo(1, 6);
  });

  it("at t=1 returns the to state", () => {
    const s = samplePanelTween(from, to, 1);
    expect(s.position.x).toBeCloseTo(100, 6);
    expect(s.quaternion.z).toBeCloseTo(halfRoot2, 6);
    expect(s.quaternion.w).toBeCloseTo(halfRoot2, 6);
  });

  it("slerps quaternions through unit-norm intermediates", () => {
    for (let i = 0; i <= 10; i++) {
      const s = samplePanelTween(from, to, i / 10);
      const n = Math.hypot(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w);
      expect(n).toBeCloseTo(1, 6);
    }
  });
});

describe("sampleArrowTween", () => {
  it("shrinks from 1 to 0 monotonically", () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = sampleArrowTween(1, 0, i / 20);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(sampleArrowTween(1, 0, 0)).toBe(1);
    expect(sampleArrowTween(1, 0, 1)).toBe(0);
  });
});

describe("AnimRunner", () => {
  it("drives onUpdate from 0 to 1 across the duration", () => {
    let t = 0;
    const runner = new AnimRunner(() => t);
    const samples: number[] = [];
    runner.start({
      key: "x",
      durationMs: 100,
      onUpdate: (v) => samples.push(v),
    });
    t = 0;
    runner.tick();
    t = 50;
    runner.tick();
    t = 100;
    runner.tick();
    expect(samples[0]).toBeCloseTo(0, 6);
    expect(samples[1]).toBeCloseTo(0.5, 6);
    expect(samples[2]).toBe(1);
  });

  it("invokes onComplete after final onUpdate(1) and clears the slot", () => {
    let t = 0;
    const runner = new AnimRunner(() => t);
    let completed = false;
    let lastT = -1;
    runner.start({
      key: "k",
      durationMs: 10,
      onUpdate: (v) => {
        lastT = v;
      },
      onComplete: () => {
        completed = true;
      },
    });
    t = 20;
    runner.tick();
    expect(lastT).toBe(1);
    expect(completed).toBe(true);
    expect(runner.has("k")).toBe(false);
  });

  it("re-starting a key replaces the previous tween", () => {
    let t = 0;
    const runner = new AnimRunner(() => t);
    const log: string[] = [];
    runner.start({
      key: "k",
      durationMs: 100,
      onUpdate: () => log.push("first"),
    });
    runner.start({
      key: "k",
      durationMs: 100,
      onUpdate: () => log.push("second"),
    });
    t = 50;
    runner.tick();
    expect(log).toEqual(["second"]);
  });

  it("zero-duration tweens land at t=1 immediately and call onComplete", () => {
    const runner = new AnimRunner(() => 0);
    let lastT = -1;
    let completed = false;
    runner.start({
      key: "k",
      durationMs: 0,
      onUpdate: (v) => (lastT = v),
      onComplete: () => (completed = true),
    });
    expect(lastT).toBe(1);
    expect(completed).toBe(true);
    expect(runner.has("k")).toBe(false);
  });

  it("finalize() lands a running tween at t=1 and removes it", () => {
    let t = 0;
    const runner = new AnimRunner(() => t);
    const seen: number[] = [];
    runner.start({
      key: "k",
      durationMs: 1000,
      onUpdate: (v) => seen.push(v),
    });
    t = 100;
    runner.tick();
    expect(runner.finalize("k")).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
    expect(runner.has("k")).toBe(false);
  });

  it("cancel() drops a tween without finalizing", () => {
    const runner = new AnimRunner(() => 0);
    let completed = false;
    runner.start({
      key: "k",
      durationMs: 100,
      onUpdate: () => {},
      onComplete: () => (completed = true),
    });
    expect(runner.cancel("k")).toBe(true);
    runner.tick();
    expect(completed).toBe(false);
    expect(runner.has("k")).toBe(false);
  });
});
