import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import { Motion } from "../Motion.js";
import { ManualTriggerDelegate } from "../TriggerDelegate.js";
import { Track } from "../Track.js";

function track(id) { const proxy = { value: 0 }; return new Track({ id, interpolationTimeline: gsap.to(proxy, { value: 1, duration: 1, paused: true }), proxyState: proxy, plugins: [], resolvedTrack: { id, keyframes: {} } }); }
function motion(id) { return new Motion({ id, triggerDelegate: new ManualTriggerDelegate() }); }

describe("recursive Motion scheduling", () => {
  it("schedules a depth-three Motion tree with parent-relative offsets", () => {
    const root = motion("root"); const child = motion("child"); const grandchild = motion("grandchild");
    root.init(); child.init(); grandchild.init();
    child.mount(track("child-track")); grandchild.mount(track("grandchild-track"));
    child.mount(grandchild, 0.25); root.mount(child, 0.5);
    expect(child.isMounted).toBe(true); expect(grandchild.isMounted).toBe(true);
    // The child runs for 1.25s: its own track is 1s and its nested Motion
    // extends the schedule to 0.25 + 1s. The root therefore runs for 1.75s.
    // Checkpoints are expressed as normalized root progress.
    root.seek(2 / 7); expect(child.progress()).toBeCloseTo(0, 5);
    root.seek(9 / 14); expect(child.progress()).toBeCloseTo(0.5, 5);
    root.destroy(); expect(child.isDestroyed).toBe(true); expect(grandchild.isDestroyed).toBe(true);
  });
  it("restarts nested schedules without duplicating slots", () => {
    const root = motion("root"); const child = motion("child"); root.init(); child.init(); child.mount(track("child-track")); root.mount(child); root.init(); expect(child.isMounted).toBe(true); root.destroy();
  });
});
