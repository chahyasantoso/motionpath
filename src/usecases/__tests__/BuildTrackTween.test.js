import { describe, it, expect } from "vitest";
import { buildTrackTween } from "../BuildTrackTween.js";

describe("buildTrackTween deterministic plugin contract", () => {
  it("rejects path and transform output overlap instead of using JSON key order", () => {
    const keyframes = {
      path: {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        stops: [
          { p: 0, v: 0 },
          { p: 1, v: 1 },
        ],
      },
      x: {
        stops: [
          { p: 0, v: 0 },
          { p: 1, v: 10 },
        ],
      },
    };
    expect(() =>
      buildTrackTween("collision", keyframes, 1, { keyframes }),
    ).toThrow(/Output collision/);
  });

  it("uses canonical percent keys during compilation", () => {
    const result = buildTrackTween(
      "decimal",
      {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.29, v: 0.5 },
            { p: 1, v: 1 },
          ],
        },
      },
      1,
      { keyframes: {} },
    );
    expect(result.proxy.opacity).toBe(0);
    result.tween.kill();
  });
});
