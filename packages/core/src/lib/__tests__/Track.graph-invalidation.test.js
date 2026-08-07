/**
 * PR-03, child removal routed through graph invalidation.
 *
 * removeChild detached the child's observation edges and stopped there. The
 * child stayed in the publish order composing off a timeline nothing advanced,
 * and its dependents kept their warm patch, still carrying a contribution from
 * a track that had left the motion.
 */
import { describe, expect, it } from "vitest";
import { GraphBinding } from "../../usecases/GraphBinding.js";
import { GraphPublisher } from "../../usecases/GraphPublisher.js";
import { buildRealGraph, chainMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

describe("Track.removeChild — graph invalidation", () => {
  it("drops the removed child from the publish order", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });

    tracks.get("n0").addChild(tracks.get("n1"));
    tracks.get("n0").removeChild("n1");

    expect(publisher.graphOrder).toEqual(["n0", "n2"]);
    expect(publisher.trackCount).toBe(2);
  });

  it("invalidates the dependents that lost a source", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const published = [];
    const publisher = new GraphPublisher({ graph, tracks, publish: (id, patch) => published.push([id, patch]) });
    publisher.markAllDirty();
    publisher.flush();
    tracks.get("n0").addChild(tracks.get("n1"));
    publisher.flush();
    published.length = 0;

    tracks.get("n0").removeChild("n1");
    publisher.flush();

    expect(published.map(([id]) => id)).toEqual(["n2"]);
    // The stale-render bug: n2's warm patch still carried n1's contribution.
    expect(published[0][1].from_n1).toBeUndefined();
  });

  it("leaves the removed child alive and composable", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    new GraphPublisher({ graph, tracks, publish: () => {} });
    const child = tracks.get("n1");

    tracks.get("n0").addChild(child);
    tracks.get("n0").removeChild("n1");

    expect(child.isDestroyed).toBe(false);
    expect(() => child.compose()).not.toThrow();
    expect(child.observedEdges).toHaveLength(0);
  });

  it("drops the child from the binding's IR without destroying it", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const binding = new GraphBinding({ graph, tracks, publisher });
    const child = tracks.get("n1");

    tracks.get("n0").addChild(child);
    tracks.get("n0").removeChild("n1");

    expect(binding.graph.nodes.map((node) => node.id)).toEqual(["n0", "n2"]);
    expect(binding.graph.edges).toEqual([]);
    expect(binding.tracks.has("n1")).toBe(false);
    expect(child.isDestroyed).toBe(false);
    expect(publisher.graphOrder).toEqual(["n0", "n2"]);
  });

  it("keeps a standalone parent/child pair working without a graph", () => {
    const parent = makeTrack("parent");
    const child = makeTrack("child");
    const watcher = makeTrack("watcher");
    parent.addChild(child);
    watcher.setObserved(child, (patch) => ({ fromChild: patch.transform }));

    expect(() => parent.removeChild("child")).not.toThrow();
    expect(watcher.observedSources).toHaveLength(0);
    expect(child.isDestroyed).toBe(false);
  });
});

describe("Track.replaceObserved — replacement additions", () => {
  it("announces the addition, not just the removal", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const c = makeTrack("c");
    c.setObserved(b, (patch) => ({ up: patch.transform }));

    const events = [];
    c.onLifecycle((event) => events.push(event));
    c.replaceObserved(b, a, (patch) => ({ up: patch.transform }));

    const types = events.map((event) => event.type);
    expect(types).toContain("edge-removed");
    expect(types).toContain("edge-added");
    expect(types.indexOf("edge-removed")).toBeLessThan(types.indexOf("edge-added"));

    const added = events.find((event) => event.type === "edge-added");
    expect(added.edge).toMatchObject({ source: "a", target: "c", role: "output" });
    expect(added.source).toBe(a);
  });

  it("lets a listener rebuild the edge set from events alone", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const c = makeTrack("c");
    c.setObserved(b, (patch) => ({ up: patch.transform }));

    const edges = new Set(["b->c"]);
    c.onLifecycle((event) => {
      if (event.type === "edge-removed") edges.delete(`${event.edge.source}->${event.edge.target}`);
      if (event.type === "edge-added" || event.type === "edge-replaced") edges.add(`${event.edge.source}->${event.edge.target}`);
    });

    c.replaceObserved(b, a, (patch) => ({ up: patch.transform }));

    // Before this fix the rewire looked like a pure deletion and the listener
    // ended up with an empty edge set.
    expect([...edges]).toEqual(["a->c"]);
  });
});
