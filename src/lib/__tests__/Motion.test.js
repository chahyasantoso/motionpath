import { describe, it, expect, vi } from "vitest";
import { Motion } from "../Motion.js";
import { Track } from "../Track.js";
import {
  TimeTriggerDelegate,
  ManualTriggerDelegate,
} from "../TriggerDelegate.js";
import { gsap } from "gsap";

function createDummyTrack(id = "test-track") {
  const proxy = { opacity: 0 };
  const tween = gsap.to(proxy, { opacity: 1, duration: 1, paused: true });
  return new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins: [],
    resolvedTrack: { id, keyframes: {} },
  });
}

describe("Motion & TriggerDelegates (v4)", () => {
  it("should mount tracks and drive progress through the public Motion facade", () => {
    const delegate = new TimeTriggerDelegate({ duration: 2 });
    const motion = new Motion({ id: "time-motion", triggerDelegate: delegate });
    motion.init();
    const track = createDummyTrack("m-track");

    motion.mount(track);
    expect(track.isMounted).toBe(true);

    motion.seek(0.5);
    expect(track.progress()).toBe(0.5);
    motion.destroy();
  });

  it("should expose the same control vocabulary for ManualTriggerDelegate", () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: "manual-motion",
      triggerDelegate: delegate,
    });
    motion.init();
    const track = createDummyTrack("manual-track");

    motion.mount(track);
    expect(typeof motion.play).toBe("function");
    expect(typeof motion.pause).toBe("function");
    expect(typeof motion.seek).toBe("function");
    expect(typeof motion.reverse).toBe("function");
    expect(typeof motion.onComplete).toBe("function");

    motion.seek(0.75);
    expect(track.progress()).toBe(0.75);
    motion.destroy();
  });

  it("should render a newly added child track at the current master timeline progress", () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: "manual-motion",
      triggerDelegate: delegate,
    });
    motion.init();

    const parentTrack = createDummyTrack("parent-track");
    motion.mount(parentTrack);

    motion.seek(0.5);

    const childTrack = createDummyTrack("child-track");
    parentTrack.addChild(childTrack, { stagger: 0 });

    expect(childTrack.progress()).toBeCloseTo(0.5, 5);
    motion.destroy();
  });

  it("should reposition a sibling's mounted tween on removal-triggered reflow, not just update bookkeeping", () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: "manual-motion",
      triggerDelegate: delegate,
    });
    motion.init();

    const parentTrack = createDummyTrack("parent-track");
    motion.mount(parentTrack);

    const childA = createDummyTrack("child-a");
    const childB = createDummyTrack("child-b");
    const childC = createDummyTrack("child-c");
    parentTrack.addChild(childA, { stagger: 0.2 });
    parentTrack.addChild(childB, { stagger: 0.2 });
    parentTrack.addChild(childC, { stagger: 0.2 });

    parentTrack.removeChild(childB.id);
    expect(childC.currentOffset).toBeCloseTo(0.2, 5);

    motion.seek(0.3);
    expect(childC.progress()).toBeCloseTo(0.16, 2);
    motion.destroy();
  });

  it("should snap (not animate) reflow when staggerTransition is absent", () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: "manual-motion",
      triggerDelegate: delegate,
    });
    motion.init();

    const toSpy = vi.spyOn(gsap, "to");
    const parentTrack = createDummyTrack("parent-track");
    motion.mount(parentTrack);

    const childA = createDummyTrack("child-a");
    const childB = createDummyTrack("child-b");
    const childC = createDummyTrack("child-c");
    parentTrack.addChild(childA, { stagger: 0.2 });
    parentTrack.addChild(childB, { stagger: 0.2 });
    parentTrack.addChild(childC, { stagger: 0.2 });

    toSpy.mockClear();
    parentTrack.removeChild(childB.id);
    const reflowAnimateCalls = toSpy.mock.calls.filter(
      ([, vars]) =>
        vars && Object.prototype.hasOwnProperty.call(vars, "startTime"),
    );
    expect(reflowAnimateCalls.length).toBe(0);
    toSpy.mockRestore();
    motion.destroy();
  });

  it("should animate reflow via tween.startTime when staggerTransition has a nonzero duration", () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: "manual-motion",
      triggerDelegate: delegate,
      staggerTransition: { duration: 0.3, ease: "power3.out" },
    });
    motion.init();

    const parentTrack = createDummyTrack("parent-track");
    motion.mount(parentTrack);

    const childA = createDummyTrack("child-a");
    const childB = createDummyTrack("child-b");
    const childC = createDummyTrack("child-c");
    parentTrack.addChild(childA, { stagger: 0.2 });
    parentTrack.addChild(childB, { stagger: 0.2 });
    parentTrack.addChild(childC, { stagger: 0.2 });

    const toSpy = vi.spyOn(gsap, "to");
    parentTrack.removeChild(childB.id);
    const reflowAnimateCalls = toSpy.mock.calls.filter(
      ([, vars]) =>
        vars && Object.prototype.hasOwnProperty.call(vars, "startTime"),
    );
    expect(reflowAnimateCalls.length).toBe(1);
    const [, vars] = reflowAnimateCalls[0];
    expect(vars.startTime).toBeCloseTo(0.2, 5);
    expect(vars.duration).toBe(0.3);
    expect(vars.ease).toBe("power3.out");
    expect(typeof vars.onUpdate).toBe("function");
    toSpy.mockRestore();
    motion.destroy();
  });
});
