import { describe, it, expect, vi } from "vitest";
import {
  buildMotionPath,
  convertToCubicPath,
  getPointOnCubicPath,
  getPointOnPath,
  splitQuadraticBezier,
  findClosestPointOnSegment,
} from "../pathUtils.js";

describe("buildMotionPath", () => {
  it("should return empty string for null or empty input", () => {
    expect(buildMotionPath(null)).toBe("");
    expect(buildMotionPath(undefined)).toBe("");
    expect(buildMotionPath([])).toBe("");
  });

  it("should build simple path with only M and L commands", () => {
    const pathNodes = [
      { x: 10, y: 20 },
      { x: 100, y: 200 },
    ];
    expect(buildMotionPath(pathNodes)).toBe("M 10 20 L 100 200");
  });

  it("should build bezier curves with Q command when ctrlX and ctrlY are provided", () => {
    const pathNodes = [
      { x: 0, y: 0 },
      { x: 300, y: 150, ctrlX: 150, ctrlY: -50 },
    ];
    expect(buildMotionPath(pathNodes)).toBe("M 0 0 Q 150 -50 300 150");
  });

  it("should build mixed straight and curved paths correctly", () => {
    const pathNodes = [
      { x: 0, y: 0 },
      { x: 300, y: 150, ctrlX: 150, ctrlY: -50 },
      { x: 800, y: 400 },
    ];
    expect(buildMotionPath(pathNodes)).toBe(
      "M 0 0 Q 150 -50 300 150 L 800 400",
    );
  });

  it("should produce only M command for a single node", () => {
    const pathNodes = [{ x: 42, y: 99 }];
    expect(buildMotionPath(pathNodes)).toBe("M 42 99");
  });
});

describe("convertToCubicPath", () => {
  it("should return empty array for null or empty input", () => {
    expect(convertToCubicPath(null)).toEqual([]);
    expect(convertToCubicPath(undefined)).toEqual([]);
    expect(convertToCubicPath([])).toEqual([]);
  });

  it("should return single anchor for single-node input", () => {
    const result = convertToCubicPath([{ x: 10, y: 20 }]);
    expect(result).toEqual([{ x: 10, y: 20, z: 0 }]);
  });

  it("should default z to 0 when not provided", () => {
    const result = convertToCubicPath([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(result).toHaveLength(4);
    result.forEach((point) => {
      expect(point.z).toBe(0);
    });
  });

  it("should preserve explicit z values", () => {
    const result = convertToCubicPath([
      { x: 0, y: 0, z: 10 },
      { x: 100, y: 100, z: 50 },
    ]);
    expect(result[0].z).toBe(10);
    expect(result[3].z).toBe(50);
  });

  it("should produce 3n+1 length arrays", () => {
    expect(
      convertToCubicPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toHaveLength(4);

    expect(
      convertToCubicPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]),
    ).toHaveLength(7);
  });

  it("should place straight-line control points at 1/3 and 2/3", () => {
    const result = convertToCubicPath([
      { x: 0, y: 0, z: 0 },
      { x: 30, y: 60, z: 90 },
    ]);
    expect(result[1]).toEqual({ x: 10, y: 20, z: 30 });
    expect(result[2]).toEqual({ x: 20, y: 40, z: 60 });
  });

  it("should elevate quadratic control points to cubic correctly", () => {
    const result = convertToCubicPath([
      { x: 0, y: 0, z: 0 },
      { x: 300, y: 150, z: 0, ctrlX: 150, ctrlY: -50 },
    ]);
    expect(result[1].x).toBeCloseTo(100);
    expect(result[1].y).toBeCloseTo(-100 / 3);
    expect(result[2].x).toBeCloseTo(200);
    expect(result[2].y).toBeCloseTo(16.667, 1);
  });
});

describe("getPointOnCubicPath", () => {
  it("should return default values if cubicPath is missing or empty", () => {
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

  it("should return first node values if cubicPath has length 1", () => {
    const path = [{ x: 10, y: 20, z: 30 }];
    expect(getPointOnCubicPath(path, 0.5)).toEqual({
      x: 10,
      y: 20,
      z: 30,
      rotation: 0,
    });
  });

  it("should calculate midpoint of straight line correctly", () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 20, z: 30 },
      { x: 20, y: 40, z: 60 },
      { x: 30, y: 60, z: 90 },
    ];

    const result = getPointOnCubicPath(path, 0.5);

    expect(result.x).toBeCloseTo(15);
    expect(result.y).toBeCloseTo(30);
    expect(result.z).toBeCloseTo(45);
    expect(result.rotation).toBeCloseTo(Math.atan2(60, 30) * (180 / Math.PI));
  });

  it("should clamp progress below 0 and above 1", () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 20, z: 30 },
      { x: 20, y: 40, z: 60 },
      { x: 30, y: 60, z: 90 },
    ];

    const resultMin = getPointOnCubicPath(path, -0.5);
    expect(resultMin.x).toBeCloseTo(0);

    const resultMax = getPointOnCubicPath(path, 1.5);
    expect(resultMax.x).toBeCloseTo(30);
  });
});

describe("getPointOnPath", () => {
  it("should return default values if pathEl is missing", () => {
    const result = getPointOnPath(null, 0.5);
    expect(result).toEqual({ x: 0, y: 0, rotation: 0, progress: 0 });
  });

  it("should calculate coordinates and rotation correctly", () => {
    const mockPathEl = {
      getTotalLength: vi.fn(() => 1000),
      getPointAtLength: vi.fn((distance) => {
        if (distance === 500) return { x: 50, y: 100 };
        if (distance === 501) return { x: 51, y: 101 };
        if (distance === 499) return { x: 49, y: 99 };
        return { x: 0, y: 0 };
      }),
    };

    const result = getPointOnPath(mockPathEl, 0.5, 0);

    expect(mockPathEl.getTotalLength).toHaveBeenCalled();
    expect(mockPathEl.getPointAtLength).toHaveBeenCalledWith(500);

    expect(result.x).toBe(50);
    expect(result.y).toBe(100);
    expect(result.progress).toBe(0.5);
    expect(result.rotation).toBeCloseTo(45);
  });

  it("should respect offset and clamp values correctly", () => {
    const mockPathEl = {
      getTotalLength: vi.fn(() => 100),
      getPointAtLength: vi.fn(() => ({ x: 10, y: 20 })),
    };

    const resultMax = getPointOnPath(mockPathEl, 0.8, 0.3);
    expect(resultMax.progress).toBe(1.0);
    expect(mockPathEl.getPointAtLength).toHaveBeenCalledWith(100);

    const resultMin = getPointOnPath(mockPathEl, 0.2, -0.3);
    expect(resultMin.progress).toBe(0.0);
    expect(mockPathEl.getPointAtLength).toHaveBeenCalledWith(0);
  });
});

describe("splitQuadraticBezier", () => {
  it("should mathematically split a quadratic curve in two at t=0.5", () => {
    const p0 = { x: 0, y: 0, z: 0 };
    const q = { x: 100, y: 200, z: 10 };
    const p2 = { x: 200, y: 0, z: 20 };

    const { C_L, P_split, C_R } = splitQuadraticBezier(p0, q, p2, 0.5);

    // C_L = 0.5*P0 + 0.5*Q = (50, 100, 5)
    expect(C_L.x).toBe(50);
    expect(C_L.y).toBe(100);
    expect(C_L.z).toBe(5);

    // C_R = 0.5*Q + 0.5*P2 = (150, 100, 15)
    expect(C_R.x).toBe(150);
    expect(C_R.y).toBe(100);
    expect(C_R.z).toBe(15);

    // P_split = 0.5*C_L + 0.5*C_R = (100, 100, 10)
    expect(P_split.x).toBe(100);
    expect(P_split.y).toBe(100);
    expect(P_split.z).toBe(10);
  });
});

describe("findClosestPointOnSegment", () => {
  it("should find closest t on a straight line segment", () => {
    const p0 = { x: 0, y: 0 };
    const p2 = { x: 100, y: 100 };

    // Point exactly at (30, 30) should be at t=0.3
    const result = findClosestPointOnSegment(p0, p2, 30, 30);
    expect(result.t).toBeCloseTo(0.3);
    expect(result.x).toBeCloseTo(30);
    expect(result.y).toBeCloseTo(30);
    expect(result.distance).toBeCloseTo(0);
  });

  it("should find closest t on a curved segment", () => {
    const p0 = { x: 0, y: 0 };
    const q = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };

    // Sample the peak at t=0.5: x = 50, y = 50
    // If we query (50, 48), the closest point on curve should be very close to t=0.5
    const result = findClosestPointOnSegment(p0, p2, 50, 48, q);
    expect(result.t).toBeCloseTo(0.5);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(50);
    expect(result.distance).toBeCloseTo(2);
  });
});
