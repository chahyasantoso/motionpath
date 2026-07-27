import { describe, it, expect } from "vitest";
import { composeTrackPatch } from "../ComposeTrackPatch.js";
import { createAnimationPlugin } from "../../domain/createAnimationPlugin.js";

describe("composeTrackPatch output metadata", () => {
  it("uses plugin-declared shallow merging for structured output", () => {
    const a = createAnimationPlugin({
      outputs: { state: { merge: "shallow" } },
      compose: () => ({ state: { a: 1 } }),
    });
    const b = createAnimationPlugin({
      outputs: { state: { merge: "shallow" } },
      compose: () => ({ state: { b: 2 } }),
    });
    expect(composeTrackPatch([a, b], {}, {})).toEqual({
      state: { a: 1, b: 2 },
    });
  });

  it("does not leak plugin internals to a renderer", () => {
    const plugin = createAnimationPlugin({
      internalKeys: ["privateValue"],
      compose: () => ({ privateValue: 1, opacity: 0.5 }),
    });
    expect(composeTrackPatch([plugin], {}, {})).toEqual({ opacity: 0.5 });
  });
});
