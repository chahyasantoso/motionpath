import { describe, expect, it, vi } from "vitest";
import { createGsapPlatform, registerScrollTrigger } from "../../adapters/gsapPlatform.js";

describe("GSAP platform adapter", () => {
  it("exposes an explicit registration boundary", () => {
    const platform = createGsapPlatform();
    expect(platform.gsap).toBeDefined();
    expect(platform.registerScrollTrigger).toBeTypeOf("function");
    expect(platform.registerScrollTrigger()).toBeDefined();
    expect(registerScrollTrigger()).toBeDefined();
  });

  it("can disable browser-trigger registration for headless consumers", () => {
    const platform = createGsapPlatform({ enableScrollTrigger: false });
    expect(platform.registerScrollTrigger()).toBeUndefined();
  });
});
