import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CLOSE_SHOT_PADDING,
  DEFAULT_VIEW_DIRECTION,
  WIDE_SHOT_PADDING,
  expandForContext,
  fitDistance,
  frameBox,
} from "../camera-framing.js";

describe("fitDistance", () => {
  it("scales linearly with bbox radius", () => {
    const d1 = fitDistance(1000, 35, 1.0, 1.0);
    const d2 = fitDistance(2000, 35, 1.0, 1.0);
    expect(d2).toBeCloseTo(d1 * 2, 6);
  });

  it("uses the smaller tangent (horizontal on portrait, vertical on landscape)", () => {
    const portrait = fitDistance(1000, 35, 0.5, 1.0);
    const landscape = fitDistance(1000, 35, 2.0, 1.0);
    // Portrait should require more distance (narrower hFOV).
    expect(portrait).toBeGreaterThan(landscape);
  });

  it("matches FOV math at unit aspect", () => {
    const radius = 1000;
    const fov = 35;
    const expected = radius / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    expect(fitDistance(radius, fov, 1.0, 1.0)).toBeCloseTo(expected, 6);
  });

  it("applies the padding factor multiplicatively", () => {
    const base = fitDistance(1000, 35, 1.0, 1.0);
    const padded = fitDistance(1000, 35, 1.0, 1.2);
    expect(padded).toBeCloseTo(base * 1.2, 6);
  });
});

describe("frameBox", () => {
  const facade = new THREE.Box3(
    new THREE.Vector3(0, 0, -25),
    new THREE.Vector3(4600, 3100, 25),
  );
  const fov = 35;

  it("targets the AABB centre", () => {
    const result = frameBox(facade, fov, 16 / 9, WIDE_SHOT_PADDING);
    const center = new THREE.Vector3();
    facade.getCenter(center);
    expect(result.target.distanceTo(center)).toBeLessThan(1e-6);
  });

  it("positions camera along the default view direction", () => {
    const result = frameBox(facade, fov, 16 / 9, WIDE_SHOT_PADDING);
    const offset = result.position.clone().sub(result.target).normalize();
    const expected = DEFAULT_VIEW_DIRECTION.clone().normalize();
    expect(offset.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it("portrait aspect pulls camera back vs landscape", () => {
    const landscape = frameBox(facade, fov, 16 / 9, WIDE_SHOT_PADDING);
    const portrait = frameBox(facade, fov, 9 / 19, WIDE_SHOT_PADDING);
    const center = new THREE.Vector3();
    facade.getCenter(center);
    const dL = landscape.position.distanceTo(center);
    const dP = portrait.position.distanceTo(center);
    expect(dP).toBeGreaterThan(dL);
  });

  it("frames the bbox: corners project inside the FOV cone", () => {
    const aspect = 393 / 852; // mobile portrait
    const result = frameBox(facade, fov, aspect, WIDE_SHOT_PADDING);
    // Vector from camera to each corner; the half-angle to the corner must
    // not exceed the relevant half-FOV.
    const halfV = THREE.MathUtils.degToRad(fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const view = result.target.clone().sub(result.position).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(view, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, view).normalize();

    const corners: THREE.Vector3[] = [];
    facade.getSize(new THREE.Vector3()); // touch
    const min = facade.min;
    const max = facade.max;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    for (const c of corners) {
      const d = c.clone().sub(result.position);
      const fwd = d.dot(view);
      expect(fwd).toBeGreaterThan(0); // in front of camera
      const horiz = d.dot(right);
      const vert = d.dot(realUp);
      expect(Math.atan2(Math.abs(horiz), fwd)).toBeLessThanOrEqual(halfH + 1e-6);
      expect(Math.atan2(Math.abs(vert), fwd)).toBeLessThanOrEqual(halfV + 1e-6);
    }
  });
});

describe("expandForContext", () => {
  it("scales the bbox about its centre", () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-500, -250, -25),
      new THREE.Vector3(500, 250, 25),
    );
    const expanded = expandForContext(bbox, 2.0);
    const center = new THREE.Vector3();
    expanded.getCenter(center);
    expect(center.length()).toBeLessThan(1e-6);
    const size = new THREE.Vector3();
    expanded.getSize(size);
    expect(size.x).toBeCloseTo(2000, 6);
    expect(size.y).toBeCloseTo(1000, 6);
    expect(size.z).toBeCloseTo(100, 6);
  });
});

describe("constants", () => {
  it("close shot padding is sane", () => {
    expect(CLOSE_SHOT_PADDING).toBeGreaterThan(1);
    expect(CLOSE_SHOT_PADDING).toBeLessThan(2);
  });
});
