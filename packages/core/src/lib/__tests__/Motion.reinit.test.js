import { describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import { Motion } from "../Motion.js";
import { ManualTriggerDelegate } from "../TriggerDelegate.js";
import { Track } from "../Track.js";

function track(id) {
  const proxy = { opacity: 0 };
  return new Track({ id, interpolationTimeline: gsap.to(proxy, { opacity: 1, duration: 1, paused: true }), proxyState: proxy, plugins: [], resolvedTrack: { id, keyframes: {} } });
}

function activeMotion(id = "motion") {
  return new Motion({ id, triggerDelegate: new ManualTriggerDelegate() });
}

describe("repeated Motion initialization", () => {
  it("restarts without destroying the mounted tracks", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    motion.init();
    expect(parent.isDestroyed).toBe(false);
    expect(parent.isMounted).toBe(true);
    expect(motion.getTrack("parent")).toBe(parent);
    motion.destroy();
  });

  it("still drives progress through the rebuilt timeline", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    motion.init();
    motion.seek(0.5);
    expect(parent.progress()).toBeCloseTo(0.5, 5);
    motion.destroy();
  });

  it("keeps dynamically added children scheduled across a restart", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    const child = track("child");
    parent.addChild(child, { stagger: 0 });
    motion.init();
    expect(child.isDestroyed).toBe(false);
    expect(child.isMounted).toBe(true);
    expect(motion.getTrack("child")).toBe(child);
    motion.seek(0.5);
    expect(child.progress()).toBeCloseTo(0.5, 5);
    motion.destroy();
  });

  it("schedules each track exactly once per initialization", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    const toSpy = vi.spyOn(gsap, "to");
    motion.init();
    expect(toSpy.mock.calls.filter(([target]) => target === parent)).toHaveLength(1);
    toSpy.mockRestore();
    motion.destroy();
  });

  it("preserves the graph binding across a restart and releases it on destroy", () => {
    let destroyed = 0;
    const binding = { destroy() { destroyed += 1; } };
    const motion = activeMotion();
    motion.setGraphBinding(binding);
    motion.init();
    motion.init();
    expect(motion.graphBinding).toBe(binding);
    expect(destroyed).toBe(0);
    motion.destroy();
    expect(destroyed).toBe(1);
  });

  it("refuses to re-initialize a destroyed Motion instead of returning a hollow one", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    motion.destroy();
    expect(motion.isActive).toBe(false);
    expect(() => motion.init()).toThrow(/destroyed/i);
    expect(parent.isDestroyed).toBe(true);
  });

  it("initializes cleanly when tracks were mounted before the first init", () => {
    const motion = activeMotion();
    const parent = track("parent");
    motion.mount(parent, 0);
    expect(motion.isActive).toBe(false);
    motion.init();
    expect(motion.isActive).toBe(true);
    expect(parent.isMounted).toBe(true);
    motion.destroy();
  });
});
