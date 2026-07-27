import { describe, it, expect } from "vitest";
import { filterGroupPlugin } from "../filterProperty.js";

describe("filterGroupPlugin", () => {
  it("declares correct keys list", () => {
    expect(filterGroupPlugin.keys).toEqual([
      "blur",
      "brightness",
      "contrast",
      "saturate",
    ]);
    expect(filterGroupPlugin.lazy).toBe(false);
  });

  it("claims keys correctly", () => {
    expect(filterGroupPlugin.claimsKey("blur")).toBe(true);
    expect(filterGroupPlugin.claimsKey("brightness")).toBe(true);
    expect(filterGroupPlugin.claimsKey("contrast")).toBe(true);
    expect(filterGroupPlugin.claimsKey("saturate")).toBe(true);
    expect(filterGroupPlugin.claimsKey("x")).toBe(false);
  });

  it("contribute maps stops to correct synthetic proxy keys, never to standard filter directly", () => {
    const stops = [
      { p: 0, v: 0 },
      { p: 1, v: 15, ease: "linear" },
    ];

    const result = filterGroupPlugin.contribute("blur", stops);

    expect(result.percentPatch).toEqual({
      "0%": { blur: 0 },
      "100%": { blur: 15, ease: "linear" },
    });
    expect(result.tweenVars).toEqual({});

    // Verify 'filter' key is completely absent from all frames
    for (const frame of Object.values(result.percentPatch)) {
      expect("filter" in frame).toBe(false);
    }
  });

  describe("compose()", () => {
    it("composes rawData to structured numeric object under filter key", () => {
      expect(filterGroupPlugin.compose({ blur: 10 })).toEqual({
        filter: { blur: 10 },
      });

      expect(filterGroupPlugin.compose({ blur: 10, brightness: 1.2 })).toEqual({
        filter: { blur: 10, brightness: 1.2 },
      });

      expect(
        filterGroupPlugin.compose({ contrast: 0.8, saturate: 1.5 }),
      ).toEqual({
        filter: { contrast: 0.8, saturate: 1.5 },
      });
    });

    it("returns empty object when no filter values are present", () => {
      expect(filterGroupPlugin.compose({})).toEqual({});
      expect(filterGroupPlugin.compose({ x: 10 })).toEqual({});
    });
  });
});
