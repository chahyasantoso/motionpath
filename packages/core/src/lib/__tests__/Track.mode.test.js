import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import { Track } from "../Track.js";
import { createTrack } from "../createTrack.js";

function track(id, mode) {
  const proxy = { x: 0 };
  const tween = gsap.to(proxy, { x: 1, duration: 1, paused: true });
  return new Track({ id, mode, interpolationTimeline: tween, proxyState: proxy, plugins: [{ keys: ["x"], compose: (raw) => ({ x: raw.x }) }], resolvedTrack: { id, keyframes: { x: {} } } });
}

describe("explicit Track mode", () => {
  it("preserves authored-graph and standalone modes at runtime", () => {
    expect(track("authored", "authored-graph").mode).toBe("authored-graph");
    expect(track("local", "standalone").mode).toBe("standalone");
    expect(track("legacy").mode).toBe("standalone");
  });

  it("does not infer standalone mode from a qualified authored id", () => {
    const runtime = track("right/bone", "authored-graph");
    expect(runtime.mode).toBe("authored-graph");
  });
});


describe("createTrack mode propagation", () => {
  it("preserves config mode for authored and explicit standalone tracks", () => {
    const authored = createTrack({ id: "motion/bone", mode: "authored-graph", keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } });
    const standalone = createTrack({ id: "~/free", mode: "standalone", keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } });
    expect(authored.mode).toBe("authored-graph");
    expect(standalone.mode).toBe("standalone");
    authored.destroy();
    standalone.destroy();
  });
});
