import { describe, it, expect } from "vitest";
import { applyAnchor } from "../helpers.js";

describe("applyAnchor", () => {
  it("should merge xPercent and yPercent into patch when anchor is provided", () => {
    const patch = { x: 100, y: 50 };
    const anchor = { xPercent: -50, yPercent: -50 };
    const result = applyAnchor(patch, anchor);

    expect(result).toEqual({ x: 100, y: 50, xPercent: -50, yPercent: -50 });
  });

  it("should return original patch unchanged when anchor is undefined", () => {
    const patch = { x: 100, y: 50 };
    const result = applyAnchor(patch, undefined);

    expect(result).toBe(patch);
  });

  it("applies pixel offset additively on top of patch x/y", () => {
    const patch = { x: 50, y: 100, transform: "translate3d(50px, 100px, 0px)" };
    const result = applyAnchor(patch, {
      xPercent: -50,
      yPercent: -50,
      offset: { x: 10, y: -5 },
    });
    expect(result.x).toBe(60);
    expect(result.y).toBe(95);
    expect(result.xPercent).toBe(-50);
    expect(result.offset).toBeUndefined(); // must not leak to gsap.set
  });

  it("omitting offset leaves x/y untouched", () => {
    const patch = { x: 50, y: 100 };
    const result = applyAnchor(patch, { xPercent: -50, yPercent: -50 });
    expect(result.x).toBe(50);
    expect(result.y).toBe(100);
  });
});
