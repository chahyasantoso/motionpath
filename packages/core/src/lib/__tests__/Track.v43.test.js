import { describe, expect, it } from "vitest";
import { makeTrack } from "../../__fixtures__/graphTracks.js";

describe("Track v4.3 lifecycle contract", () => {
  it("detaches reverse observers when a source is destroyed", () => {
    const source = makeTrack("source");
    const observer = makeTrack("observer");
    observer.setObserved(source, () => ({ fromSource: true }));

    expect(source.observerCount).toBe(1);
    source.destroy();

    expect(observer.observedSources).toHaveLength(0);
    expect(source.observerCount).toBe(0);
  });

  it("throws instead of composing or snapshotting after destroy", () => {
    const track = makeTrack("dead");
    track.destroy();

    expect(() => track.compose()).toThrow(/destroyed/i);
    expect(() => track.getSnapshot()).toThrow(/destroyed/i);
  });

  it("supports two semantic edges from one source", () => {
    const source = makeTrack("source");
    const observer = makeTrack("observer");
    observer.setObserved(source, () => ({ fromInput: true }), {
      role: "input",
      target: "parentWorld",
    });
    observer.setObserved(source, () => ({ fromOutput: true }), {
      role: "output",
    });

    expect(observer.observedSources).toEqual([source]);
    expect(observer.observedEdges).toHaveLength(2);
  });

  it("rewires atomically and preserves the observer contract", () => {
    const oldSource = makeTrack("old");
    const newSource = makeTrack("new");
    const observer = makeTrack("observer");
    observer.setObserved(oldSource, () => ({ from: "old" }));

    observer.replaceObserved(oldSource, newSource, () => ({ from: "new" }));

    expect(observer.observedSources).toEqual([newSource]);
    expect(oldSource.observerCount).toBe(0);
    expect(newSource.observerCount).toBe(1);
    expect(observer.compose().from).toBe("new");
  });

  it("keeps standalone mutual observation compatible", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    expect(() => {
      a.setObserved(b, () => ({ fromB: true }));
      b.setObserved(a, () => ({ fromA: true }));
      a.compose();
    }).not.toThrow();
  });
});
