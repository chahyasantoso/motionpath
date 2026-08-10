import { describe, expect, it, vi, beforeEach } from "vitest";
import { gsap } from "gsap";
import { domRenderer, clearRendererTarget } from "../domRenderer.js";

vi.mock("gsap", () => ({ gsap: { set: vi.fn() } }));

describe("domRenderer", () => {
  beforeEach(() => {
    gsap.set.mockClear();
  });
  it("skips identical patches and removes omitted properties", () => {
    const target = {};
    domRenderer(target, { x: 10, opacity: 1 });
    domRenderer(target, { x: 10 });
    expect(gsap.set).toHaveBeenNthCalledWith(2, target, { opacity: undefined });
    domRenderer(target, { x: 10 });
    expect(gsap.set).toHaveBeenCalledTimes(2);
  });
  it("clears the target cache so the next patch is treated as fresh", () => {
    const target = {};
    domRenderer(target, { x: 10 });
    clearRendererTarget(target);
    domRenderer(target, { x: 10 });
    expect(gsap.set).toHaveBeenCalledTimes(2);
  });
});
