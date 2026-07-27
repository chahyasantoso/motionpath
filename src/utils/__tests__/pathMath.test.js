import { describe, it, expect } from "vitest";
import { getPointOnCubicPath } from "../pathMath.js";

describe("pathMath utilities", () => {
  it("handles empty or null cubic path", () => {
    expect(getPointOnCubicPath(null, 0.5)).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
    expect(getPointOnCubicPath(undefined, 0.5)).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
    expect(getPointOnCubicPath([], 0.5)).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
  });

  it("handles single node path", () => {
    const path = [{ x: 10, y: 20, z: 30 }];
    expect(getPointOnCubicPath(path, 0.5)).toEqual({
      x: 10,
      y: 20,
      z: 30,
      rotation: 0,
    });
  });

  it("evaluates straight-line path exactly at midpoint", () => {
    // A straight horizontal cubic bezier segment
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 30, y: 0, z: 0 },
    ];

    const result = getPointOnCubicPath(path, 0.5);
    expect(result.x).toBeCloseTo(15);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
    expect(result.rotation).toBeCloseTo(0);
  });

  it("evaluates curved bezier path and calculates tangent rotation", () => {
    // Symmetrical curve starting from (0, 0) up to control points and back down to (10, 0)
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 10, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];

    // At midpoint, dy/dx should be horizontal (dy = 0, dx > 0), rotation should be 0.
    const midResult = getPointOnCubicPath(path, 0.5);
    expect(midResult.x).toBeCloseTo(5);
    expect(midResult.y).toBeCloseTo(7.5);
    expect(midResult.rotation).toBeCloseTo(0);

    // At start, tangent points upwards (dy > 0, dx = 0), rotation should be 90 degrees.
    const startResult = getPointOnCubicPath(path, 0);
    expect(startResult.x).toBeCloseTo(0);
    expect(startResult.y).toBeCloseTo(0);
    expect(startResult.rotation).toBeCloseTo(90);

    // At end, tangent points downwards (dy < 0, dx = 0), rotation should be -90 degrees.
    const endResult = getPointOnCubicPath(path, 1);
    expect(endResult.x).toBeCloseTo(10);
    expect(endResult.y).toBeCloseTo(0);
    expect(endResult.rotation).toBeCloseTo(-90);
  });
});
