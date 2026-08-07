import { describe, expect, it } from "vitest";
import { Motion } from "../Motion.js";
import { TimeTriggerDelegate, ManualTriggerDelegate } from "../TriggerDelegate.js";
import { gsap } from "gsap";
function track(id) { const proxy = { x: 0 }; return new (class extends (awaitableTrack()) {})(); }
function createTrack(id) { const proxy = { opacity: 0 }; const tween = gsap.to(proxy, { opacity: 1, duration: 1, paused: true }); return { id, interpolationTimeline: tween, proxyState: proxy, plugins: [], resolvedTrack: { id, keyframes: {} } }; }
async function awaitableTrack() { const { Track } = await import("../Track.js"); return Track; }

describe("Motion autoplay compatibility", () => {
  it("defaults time-trigger Motion autoplay to true", () => {
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
  it("manual trigger remains paused until play", () => {
    const delegate = new ManualTriggerDelegate();
    const timeline = delegate.build();
    expect(timeline.paused()).toBe(true);
    delegate.destroy();
  });
});
