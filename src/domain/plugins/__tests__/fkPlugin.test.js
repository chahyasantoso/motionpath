import { describe, it, expect } from "vitest";
import { fkPlugin } from "../fkPlugin.js";

describe("fk plugin contract", () => {
  it("separates authored keys from runtime inputs", () => {
    expect(fkPlugin.keys).toEqual(["boneLength"]);
    expect(fkPlugin.inputs).toEqual(["parentWorld"]);
    expect(fkPlugin.claimsKey("boneLength")).toBe(true);
    expect(fkPlugin.claimsKey("parentWorld")).toBe(false);
  });
});
