import { describe, expect, it } from "vitest";
import { createPluginRegistry, fkPlugin, resolvePluginForKey } from "../plugins.js";

describe("extracted core domain", () => {
  it("resolves built-in authored keys without legacy imports", () => {
    const registry = createPluginRegistry();
    expect(registry.resolve("opacity")).toBeTruthy();
    expect(registry.resolve("boneLength")).toBe(fkPlugin);
    expect(registry.resolveInput("parentWorld")).toBe(fkPlugin);
    expect(resolvePluginForKey("boneRotation")).toBe(fkPlugin);
  });
});
