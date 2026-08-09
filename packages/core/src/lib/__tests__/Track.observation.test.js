import { describe, expect, it } from "vitest";
import { GraphBinding } from "../../usecases/GraphBinding.js";
import { GraphPublisher } from "../../usecases/GraphPublisher.js";
import { buildRealGraph, chainMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

describe("Track: observer deregistration (D7)", () => {
  it("removes itself from its observers when destroyed", () => {
    const source = makeTrack("source");
    const observer = makeTrack("observer");
    observer.setObserved(source, (patch) => ({ fromSource: patch.transform }));
    source.destroy();
    expect(observer.observedSources).toHaveLength(0);
    expect(() => observer.compose()).not.toThrow();
  });

  it("notifies observers so rewire logic can react to a pop", () => {
    const source = makeTrack("popped");
    const observer = makeTrack("downstream");
    observer.setObserved(source, (patch) => ({ fromSource: patch.transform }));
    const seen = [];
    source.onSourceDestroyed?.((event) => seen.push(event));
    source.destroy();
    expect(seen).toEqual([{ id: "popped", observerIds: ["downstream"] }]);
  });

  it("detaches observation edges in both directions when a child is removed", () => {
    const parent = makeTrack("parent");
    const child = makeTrack("child");
    const watcher = makeTrack("watcher");
    parent.addChild(child, { stagger: 0 });
    watcher.setObserved(child, (patch) => ({ fromChild: patch.transform }));
    parent.removeChild("child");
    expect(watcher.observedSources).toHaveLength(0);
  });

  it("supports an atomic replaceObserved for pop-and-rewire", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const c = makeTrack("c");
    c.setObserved(b, (patch) => ({ upstream: patch.transform }));
    c.replaceObserved(b, a, (patch) => ({ upstream: patch.transform }));
    expect(c.observedSources).toEqual([a]);
    expect(() => c.compose()).not.toThrow();
  });
});

describe("Track: destroyed guards (D8)", () => {
  it("throws when composing or snapshotting a destroyed track", () => {
    const track = makeTrack("dead");
    track.destroy();
    expect(() => track.compose()).toThrow(/destroyed/i);
    expect(() => track.getSnapshot()).toThrow(/destroyed/i);
  });

  it("is dropped from its publisher when destroyed", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const published = [];
    const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
    tracks.get("n2").destroy();
    publisher.markDirty("n0");
    expect(() => publisher.flush()).not.toThrow();
    expect(published).toEqual(["n0", "n1"]);
  });
});

describe("Track: distinct observation edges (D9)", () => {
  it("holds an input edge and an output edge from the same source simultaneously", () => {
    const source = makeTrack("src");
    source.progress(1);
    const observer = makeTrack("obs");
    observer.setObserved(source, () => ({ parentWorld: { x: 1, y: 2 } }), { role: "input" });
    observer.setObserved(source, () => ({ tag: "out" }), { role: "output" });
    expect(observer.observedEdges).toHaveLength(2);
    expect(observer.compose().tag).toBe("out");
  });

  it("keeps observedSources deduplicated by source (locked semantics)", () => {
    const source = makeTrack("src");
    const observer = makeTrack("obs");
    observer.setObserved(source, () => ({ tag: "in" }), { role: "input" });
    observer.setObserved(source, () => ({ tag: "out" }), { role: "output" });
    expect(observer.observedSources).toEqual([source]);
  });

  it("still replaces the mapFn when the same source, role and input repeat", () => {
    const source = makeTrack("src");
    const observer = makeTrack("obs");
    observer.setObserved(source, () => ({ tag: "first" }));
    observer.setObserved(source, () => ({ tag: "second" }));
    expect(observer.compose().tag).toBe("second");
    expect(observer.observedEdges).toHaveLength(1);
  });
});

describe("Track: cycle rejection is scoped to graph membership (D6)", () => {
  it("still allows mutual observation for standalone tracks (LOCKED, must stay green)", () => {
    const a = makeTrack("cycle-a");
    const b = makeTrack("cycle-b");
    expect(() => {
      a.setObserved(b, (patch) => ({ fromB: patch.transform }));
      b.setObserved(a, (patch) => ({ fromA: patch.transform }));
    }).not.toThrow();
    expect(() => a.compose()).not.toThrow();
  });

  it("rejects a cycle-creating rewire once the tracks belong to a graph", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const binding = new GraphBinding({ graph, tracks, publisher, ownsPublisher: false });
    expect(() => tracks.get("n0").setObserved(tracks.get("n2"), (patch) => ({ fromN2: patch.transform }))).toThrow(/cycle/i);
    binding.destroy();
    publisher.destroy();
  });

  it("leaves the graph untouched when a cycle-creating rewire is rejected", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const binding = new GraphBinding({ graph, tracks, publisher, ownsPublisher: false });
    const before = tracks.get("n0").observedSources.length;
    expect(() => tracks.get("n0").setObserved(tracks.get("n2"), () => ({}))).toThrow();
    expect(tracks.get("n0").observedSources).toHaveLength(before);
    binding.destroy();
    publisher.destroy();
  });

  it("rejects self-observation outright", () => {
    const track = makeTrack("solo");
    expect(() => track.setObserved(track, (patch) => patch)).toThrow(/cannot observe itself/i);
  });
});
