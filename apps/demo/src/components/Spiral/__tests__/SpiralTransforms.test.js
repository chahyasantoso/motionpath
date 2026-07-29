import { describe, it, expect } from "vitest";

// SpiralBall's mergeFn logic, extracted for unit testing
function spiralMergeFn(frames) {
  const base = frames[0];
  const transition = frames[1];

  const p = base.raw?.pathProgress ?? 0;

  if (!transition && (p <= 0 || p >= 1)) {
    return { display: "none", opacity: 0 };
  }

  if (transition) {
    return { ...base.patch, ...transition.patch, display: "flex" };
  }

  return { ...base.patch, display: "flex" };
}

describe("SpiralBall mergeFn", () => {
  it("hides the ball when pathProgress is 0 (before path start)", () => {
    const frames = [{ raw: { pathProgress: 0 }, patch: { x: 0, opacity: 1 } }];
    expect(spiralMergeFn(frames)).toEqual({ display: "none", opacity: 0 });
  });

  it("hides the ball when pathProgress is 1 (past path end)", () => {
    const frames = [
      { raw: { pathProgress: 1 }, patch: { x: 100, opacity: 1 } },
    ];
    expect(spiralMergeFn(frames)).toEqual({ display: "none", opacity: 0 });
  });

  it("shows the ball with display flex when pathProgress is within (0, 1)", () => {
    const frames = [
      { raw: { pathProgress: 0.5 }, patch: { x: 50, opacity: 1 } },
    ];
    expect(spiralMergeFn(frames)).toEqual({
      x: 50,
      opacity: 1,
      display: "flex",
    });
  });

  it("merges base and transition patches when in transition, overriding overlapping keys", () => {
    const frames = [
      { raw: { pathProgress: 0 }, patch: { x: 10, y: 20, opacity: 1 } },
      { raw: {}, patch: { scale: 1.5, opacity: 0.7 } },
    ];
    expect(spiralMergeFn(frames)).toEqual({
      x: 10,
      y: 20,
      scale: 1.5,
      opacity: 0.7,
      display: "flex",
    });
  });

  it("shows in transition even when pathProgress is at boundary (p === 0)", () => {
    const frames = [
      { raw: { pathProgress: 0 }, patch: { x: 0, opacity: 0 } },
      { raw: {}, patch: { scale: 1, opacity: 1 } },
    ];
    const result = spiralMergeFn(frames);
    expect(result.display).toBe("flex");
  });
});
