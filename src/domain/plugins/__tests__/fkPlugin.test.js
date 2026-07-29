import { describe, it, expect } from "vitest";
import { fkPlugin } from "../fkPlugin.js";

describe("fk plugin contract", () => {
  it("separates authored keys from runtime inputs", () => {
    expect(fkPlugin.keys).toEqual(["boneLength", "boneRotation"]);
    expect(fkPlugin.inputs).toEqual(["parentWorld"]);
    expect(fkPlugin.claimsKey("boneLength")).toBe(true);
    expect(fkPlugin.claimsKey("boneRotation")).toBe(true);
    expect(fkPlugin.claimsKey("parentWorld")).toBe(false);
    expect(fkPlugin.claimsKey("rotation")).toBe(false);
  });

  it("contributes both authored keys to the interpolation timeline", () => {
    const length = fkPlugin.contribute("boneLength", [
      { p: 0, v: 60 },
      { p: 1, v: 80 },
    ]);
    const angle = fkPlugin.contribute("boneRotation", [
      { p: 0, v: 12, ease: "none" },
      { p: 1, v: 44, ease: "none" },
    ]);
    expect(length.percentPatch).toEqual({
      "0%": { boneLength: 60 },
      "100%": { boneLength: 80 },
    });
    expect(angle.percentPatch).toEqual({
      "0%": { boneRotation: 12, ease: "none" },
      "100%": { boneRotation: 44, ease: "none" },
    });
  });

  it("folds parentWorld and the local bone into a world transform", () => {
    const patch = fkPlugin.compose({
      parentWorld: { x: 10, y: 0, rotation: 90 },
      boneLength: 50,
      boneRotation: 30,
    });
    // composeWorld rotates the local x-axis by the parent angle. The local
    // boneRotation is accumulated into the output angle, not applied twice to
    // the position vector.
    expect(patch.x).toBeCloseTo(10, 6);
    expect(patch.y).toBeCloseTo(50, 6);
    expect(patch.rotation).toBeCloseTo(120, 6);
  });

  it("still honours a bare rotation for legacy single-key bones", () => {
    const patch = fkPlugin.compose({
      parentWorld: { x: 0, y: 0, rotation: 0 },
      boneLength: 40,
      rotation: 25,
    });
    expect(patch).toEqual({ x: 40, y: 0, rotation: 25 });
  });
});
