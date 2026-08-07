import { describe, expect, it } from "vitest";
import { Motion } from "../Motion.js";
import { ManualTriggerDelegate } from "../TriggerDelegate.js";
import { Track } from "../Track.js";
import { gsap } from "gsap";
function track(id) { const proxy = { opacity: 0 }; return new Track({ id, interpolationTimeline: gsap.to(proxy, { opacity: 1, duration: 1, paused: true }), proxyState: proxy, plugins: [], resolvedTrack: { id, keyframes: {} } }); }

describe("Motion-owned composite scheduling", () => {
  it("schedules mounted tracks through Motion and supports dynamic child slots", () => {
    const motion = new Motion({ id: "motion", triggerDelegate: new ManualTriggerDelegate() });
    motion.init();
    const parent = track("parent");
    const child = track("child");
    motion.mount(parent, 0);
    parent.addChild(child, { stagger: 0 });
    expect(parent.isMounted).toBe(true);
    expect(child.isMounted).toBe(true);
    expect(motion.getTrack("parent")).toBe(parent);
    motion.destroy();
  });
  it("repeated initialization does not create duplicate scheduler slots", () => {
    const motion = new Motion({ id: "motion", triggerDelegate: new ManualTriggerDelegate() });
    const parent = track("parent");
    motion.mount(parent, 0);
    motion.init();
    expect(motion.getTrack("parent")).toBe(parent);
    expect(parent.isMounted).toBe(true);
    motion.destroy();
  });
  it("removes a child slot without destroying the child", () => {
    const motion = new Motion({ id: "motion", triggerDelegate: new ManualTriggerDelegate() });
    motion.init();
    const parent = track("parent");
    const child = track("child");
    motion.mount(parent, 0);
    parent.addChild(child, { stagger: 0 });
    parent.removeChild("child");
    expect(child.isDestroyed).toBe(false);
    expect(child.isMounted).toBe(false);
    motion.destroy();
  });
});
