import { describe, expect, it } from "vitest";
import { Motion } from "../Motion.js";
import { ManualTriggerDelegate } from "../TriggerDelegate.js";

function track(id) { return { id, duration: 1, isMounted: false, _mount() { this.isMounted = true; }, _unmount() { this.isMounted = false; }, progress() {} }; }

describe("P2-04 explicit Motion composite ownership", () => {
  it("owns child slot operations behind named methods", () => {
    const motion = new Motion({ id: "host", triggerDelegate: new ManualTriggerDelegate() });
    const child = track("child");
    motion.init();
    expect(() => motion.mountChild(child, 0)).not.toThrow();
    expect(child.isMounted).toBe(true);
    expect(motion.getTrack("child")).toBe(child);
    motion.unmountChild(child);
    expect(child.isMounted).toBe(false);
    motion.destroy();
  });

  it("keeps underscored aliases behaviorally identical during migration", () => {
    const motion = new Motion({ id: "host", triggerDelegate: new ManualTriggerDelegate() });
    const child = track("child");
    motion.init();
    motion._mountChild(child, 0);
    expect(motion.getTrack("child")).toBe(child);
    motion._unmountChild(child);
    motion.destroy();
  });
});
