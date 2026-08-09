import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import {
  ManualTriggerDelegate,
  TimeTriggerDelegate,
} from "../TriggerDelegate.js";

describe("Motion autoplay compatibility", () => {
  it("defaults time-trigger autoplay to true", () => {
    const delegate = new TimeTriggerDelegate({});
    const timeline = delegate.build();
    expect(timeline.paused()).toBe(false);
    delegate.destroy();
  });

  it("honors explicit autoplay false", () => {
    const delegate = new TimeTriggerDelegate({ autoplay: false });
    const timeline = delegate.build();
    expect(timeline.paused()).toBe(true);
    delegate.destroy();
  });

  it("keeps manual triggers paused until play", () => {
    const delegate = new ManualTriggerDelegate();
    const timeline = delegate.build();
    expect(timeline.paused()).toBe(true);
    delegate.destroy();
  });

  it("preserves seek, pause, play and reverse controls", () => {
    const delegate = new ManualTriggerDelegate();
    const timeline = delegate.build();
    timeline.to({}, { duration: 1, x: 1 });
    delegate.seek(0.5);
    expect(timeline.progress()).toBeCloseTo(0.5, 5);
    delegate.play();
    delegate.pause();
    delegate.reverse();
    expect(() => delegate.destroy()).not.toThrow();
  });

  void gsap;
});
