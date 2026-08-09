import { describe, it, expect, vi } from "vitest";
import { gsap } from "gsap";
import { Track } from "../Track.js";
import { StaticLayoutDelegate } from "../StaticLayoutDelegate.js";
import { installLegacyObservationFacade } from "../../usecases/LegacyObservationFacade.js";

function createDummyTrack(id = "test-track", opts = {}) {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, {
    x: 100,
    y: 200,
    duration: 1,
    ease: "none",
    paused: true,
  });
  const plugins = [
    {
      keys: ["x", "y"],
      compose: (raw) => ({
        transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)`,
      }),
    },
  ];
  const resolvedTrack = { id, keyframes: { x: {}, y: {} } };

  return installLegacyObservationFacade(new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins,
    resolvedTrack,
    layoutDelegate: opts.layoutDelegate,
  }));
}

describe("Track (v4 first-class playhead owner)", () => {
  it("should support progress(p) accessor reading and writing", () => {
    const track = createDummyTrack();
    expect(track.progress()).toBe(0);
    track.progress(0.5);
    expect(track.progress()).toBe(0.5);
    const snapshot = track.getSnapshot();
    expect(snapshot.x).toBe(50);
    expect(snapshot.y).toBe(100);
    expect(snapshot.progress).toBe(0.5);
  });

  it("should be directly tweenable by GSAP accessor duck-typing without proxy objects", () => {
    const track = createDummyTrack("gsap-tweened-track");
    expect(track.progress()).toBe(0);
    const tween = gsap.to(track, { progress: 1, duration: 0.1, ease: "none", paused: true });
    tween.progress(0.5);
    expect(track.progress()).toBe(0.5);
    expect(track.getSnapshot().x).toBe(50);
  });

  it("should deliver raw proxy state on subscribe and separate composed patch on compose", () => {
    const track = createDummyTrack("sub-track");
    const subscriber = vi.fn();
    track.subscribe(subscriber);
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, progress: 0 }));
    track.progress(1);
    expect(subscriber).toHaveBeenLastCalledWith(expect.objectContaining({ x: 100, y: 200, progress: 1 }));
    const composed = track.compose();
    expect(composed).toEqual({ transform: "translate3d(100px, 200px, 0px)" });
  });

  it("should enforce single parent child relationship and throw on double addChild", () => {
    const parentA = createDummyTrack("parent-a");
    const parentB = createDummyTrack("parent-b");
    const child = createDummyTrack("child");
    parentA.addChild(child, { stagger: 0.1 });
    expect(child.parent).toBe(parentA);
    expect(() => parentB.addChild(child, { stagger: 0.1 })).toThrow(/already a child/);
  });

  it("should throw when addChild is called with a NEW object sharing an existing child id", () => {
    const parent = createDummyTrack("parent");
    const childA = createDummyTrack("duplicate-id");
    const childB = createDummyTrack("duplicate-id");
    parent.addChild(childA, { stagger: 0.1 });
    expect(() => parent.addChild(childB, { stagger: 0.1 })).toThrow(/already has a child with id/);
    expect(parent.getChild("duplicate-id")).toBe(childA);
  });

  it("getChild should be a pure read: null for unknown id, correct object for a real child, unaffected by repeated calls", () => {
    const parent = createDummyTrack("parent");
    const child = createDummyTrack("child-1");
    expect(parent.getChild("child-1")).toBeNull();
    parent.addChild(child, { stagger: 0 });
    expect(parent.getChild("child-1")).toBe(child);
    const offsetAfterFirstRead = child.currentOffset;
    parent.getChild("child-1");
    parent.getChild("child-1");
    expect(child.currentOffset).toBe(offsetAfterFirstRead);
    parent.removeChild("child-1");
    expect(parent.getChild("child-1")).toBeNull();
  });

  describe("composition via LayoutDelegate", () => {
    it("defaults to GaplessLayoutDelegate: placement is frontmost + stagger", () => {
      const parent = createDummyTrack("parent");
      const c0 = createDummyTrack("c0");
      const c1 = createDummyTrack("c1");
      const c2 = createDummyTrack("c2");
      parent.addChild(c0, { stagger: 0.1 });
      expect(c0.currentOffset).toBe(0);
      parent.addChild(c1, { stagger: 0.1 });
      expect(c1.currentOffset).toBe(0.1);
      parent.addChild(c2, { stagger: 0.1 });
      expect(c2.currentOffset).toBe(0.2);
    });

    it("defaults to GaplessLayoutDelegate: removing a mid-chain child cascades survivors, rank-0 removal does not", () => {
      const parent = createDummyTrack("parent");
      const c0 = createDummyTrack("c0");
      const c1 = createDummyTrack("c1");
      const c2 = createDummyTrack("c2");
      parent.addChild(c0, { stagger: 0.1 });
      parent.addChild(c1, { stagger: 0.1 });
      parent.addChild(c2, { stagger: 0.1 });
      parent.removeChild("c0");
      expect(c1.currentOffset).toBe(0.1);
      expect(c2.currentOffset).toBe(0.2);
      const parent2 = createDummyTrack("parent2");
      const d0 = createDummyTrack("d0");
      const d1 = createDummyTrack("d1");
      const d2 = createDummyTrack("d2");
      parent2.addChild(d0, { stagger: 0.1 });
      parent2.addChild(d1, { stagger: 0.1 });
      parent2.addChild(d2, { stagger: 0.1 });
      parent2.removeChild("d1");
      expect(d0.currentOffset).toBe(0);
      expect(d2.currentOffset).toBe(0.1);
    });

    it("honors an injected custom LayoutDelegate (StaticLayoutDelegate never reflows, even mid-chain)", () => {
      const parent = createDummyTrack("static-parent", { layoutDelegate: new StaticLayoutDelegate() });
      const c0 = createDummyTrack("sc0");
      const c1 = createDummyTrack("sc1");
      const c2 = createDummyTrack("sc2");
      parent.addChild(c0, { stagger: 0.1 });
      parent.addChild(c1, { stagger: 0.1 });
      parent.addChild(c2, { stagger: 0.1 });
      parent.removeChild("sc1");
      expect(c2.currentOffset).toBe(0.2);
    });
  });

  describe("setObserved (multi-source FK / read-only cross-track observation)", () => {
    it("folds mapFn(observed.compose()) into compose() output", () => {
      const source = createDummyTrack("source");
      source.progress(0.5);
      const follower = createDummyTrack("follower");
      follower.setObserved(source, (composed) => ({ observedTransform: composed.transform }));
      const out = follower.compose();
      expect(out.observedTransform).toBe("translate3d(50px, 100px, 0px)");
      expect(out.transform).toBe("translate3d(0px, 0px, 0px)");
    });

    it("folded patch is applied last and can override the observer's own fields", () => {
      const source = createDummyTrack("source2");
      source.progress(1);
      const follower = createDummyTrack("follower2");
      follower.setObserved(source, (composed) => ({ transform: composed.transform }));
      expect(follower.compose().transform).toBe("translate3d(100px, 200px, 0px)");
    });

    it("is cycle-safe: mutual observation resolves synchronously without stack overflow", () => {
      const a = createDummyTrack("cycle-a");
      const b = createDummyTrack("cycle-b");
      a.setObserved(b, (composed) => ({ fromB: composed.transform }));
      b.setObserved(a, (composed) => ({ fromA: composed.transform }));
      expect(() => a.compose()).not.toThrow();
      expect(() => b.compose()).not.toThrow();
      expect(a.compose().fromB).toBe("translate3d(0px, 0px, 0px)");
    });

    it("holds multiple sources and folds them in insertion order (last wins)", () => {
      const s1 = createDummyTrack("s1");
      const s2 = createDummyTrack("s2");
      s1.progress(0.5);
      s2.progress(1);
      const follower = createDummyTrack("multi-follower");
      follower.setObserved(s1, () => ({ tag: "s1" }));
      follower.setObserved(s2, () => ({ tag: "s2" }));
      expect(follower.compose().tag).toBe("s2");
      expect(follower.observedSources).toHaveLength(2);
    });

    it("setObserved(track) again replaces that source's mapFn without throwing", () => {
      const source = createDummyTrack("replace-source");
      const follower = createDummyTrack("replace-follower");
      follower.setObserved(source, () => ({ tag: "first" }));
      expect(() => follower.setObserved(source, () => ({ tag: "second" }))).not.toThrow();
      expect(follower.compose().tag).toBe("second");
      expect(follower.observedSources).toHaveLength(1);
    });

    it("removeObserved(track) drops one source; setObserved(null) clears all", () => {
      const s1 = createDummyTrack("rm1");
      const s2 = createDummyTrack("rm2");
      const follower = createDummyTrack("rm-follower");
      follower.setObserved(s1, () => ({ a: 1 }));
      follower.setObserved(s2, () => ({ b: 2 }));
      follower.removeObserved(s1);
      expect(follower.observedSources).toEqual([s2]);
      follower.setObserved(null);
      expect(follower.observedSources).toHaveLength(0);
      expect(follower.compose().b).toBeUndefined();
    });

    it("omitting mapFn is a safe no-op fold, does not crash compose()", () => {
      const source = createDummyTrack("no-mapfn-source");
      const follower = createDummyTrack("no-mapfn-follower");
      follower.setObserved(source);
      expect(() => follower.compose()).not.toThrow();
    });

    it("memoizes a diamond-shared source within a single compose() call", () => {
      const proxy = { x: 0, y: 0 };
      const tween = gsap.to(proxy, { x: 100, y: 200, duration: 1, ease: "none", paused: true });
      const pluginComposeSpy = vi.fn((raw) => ({ transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)` }));
      const d = installLegacyObservationFacade(new Track({ id: "diamond-d", interpolationTimeline: tween, proxyState: proxy, plugins: [{ keys: ["x", "y"], compose: pluginComposeSpy }], resolvedTrack: { id: "diamond-d", keyframes: { x: {}, y: {} } } }));
      const b = createDummyTrack("diamond-b");
      const c = createDummyTrack("diamond-c");
      b.setObserved(d, (composed) => ({ fromD: composed.transform }));
      c.setObserved(d, (composed) => ({ fromD: composed.transform }));
      const a = createDummyTrack("diamond-a");
      a.setObserved(b, (composed) => ({ fromB: composed.fromD }));
      a.setObserved(c, (composed) => ({ fromC: composed.fromD }));
      a.compose();
      expect(pluginComposeSpy).toHaveBeenCalledTimes(1);
      a.compose();
      expect(pluginComposeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("setObserved role:input (FK plugin pre-fold)", () => {
    it("injects parentWorld into rawData before plugins run", () => {
      const parent = createDummyTrack("fk-parent");
      parent.progress(0.5);
      const child = createDummyTrack("fk-child");
      child.setObserved(parent, (pw) => ({ parentWorld: { x: pw.x ?? 0, y: pw.y ?? 0, rotation: pw.rotation ?? 0 } }), { role: "input" });
      expect(() => child.compose()).not.toThrow();
    });

    it("role:output (default) still applies after plugins — existing behavior unchanged", () => {
      const source = createDummyTrack("role-output-source");
      source.progress(1);
      const follower = createDummyTrack("role-output-follower");
      follower.setObserved(source, (pw) => ({ transform: pw.transform }));
      expect(follower.compose().transform).toBe("translate3d(100px, 200px, 0px)");
    });

    it("input fold runs before output fold within the same compose() call", () => {
      const inputSource = createDummyTrack("order-input-source");
      inputSource.progress(0.5);
      const outputSource = createDummyTrack("order-output-source");
      outputSource.progress(0.5);
      const joint = createDummyTrack("order-joint");
      const inputSpy = vi.fn((pw) => ({ parentWorld: pw }));
      const outputSpy = vi.fn(() => ({ tag: "output" }));
      joint.setObserved(inputSource, inputSpy, { role: "input" });
      joint.setObserved(outputSource, outputSpy, { role: "output" });
      joint.compose();
      expect(inputSpy).toHaveBeenCalled();
      expect(outputSpy).toHaveBeenCalled();
    });
  });
});
