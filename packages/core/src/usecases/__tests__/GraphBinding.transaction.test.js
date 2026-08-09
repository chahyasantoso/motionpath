/**
 * PR-03, graph transaction correctness.
 *
 * The binding wired live Track edges one at a time and only cleaned up its own
 * registry when something threw. A mutation that died on its third edge left
 * the first two attached to a track that no graph knew about. These tests fail
 * the wire and the commit stage at every index and demand the exact prior
 * state back.
 */
import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

function edgeKey(source, target, role, input) {
  return `${source}|${role ?? "output"}|${input ?? ""}->${target}`;
}

function liveEdgeKeys(tracks) {
  const keys = [];
  for (const [id, track] of tracks) {
    if (track.isDestroyed) continue;
    for (const edge of track.observedEdges ?? []) keys.push(edgeKey(edge.source.id, id, edge.role, edge.input));
  }
  return keys.sort();
}

function declaredEdgeKeys(graph) {
  return graph.edges.map((edge) => edgeKey(edge.source, edge.target, edge.role, edge.input)).sort();
}

function ownerEdgeKeys(binding) {
  const keys = [];
  for (const [target] of binding.tracks) {
    for (const edge of binding.observationState.getEdges(target)) {
      keys.push(edgeKey(edge.source.id, target, edge.role, edge.input));
    }
  }
  return keys.sort();
}

function observerCounts(tracks) {
  return Object.fromEntries([...tracks].map(([id, track]) => [id, track.observerCount]));
}

function bind(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const published = [];
  const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
  const binding = new GraphBinding({ graph, tracks, publisher });
  return { graph, tracks, publisher, binding, published };
}

function snapshot(binding, publisher) {
  return {
    order: publisher.graphOrder,
    declared: declaredEdgeKeys(binding.graph),
    live: liveEdgeKeys(binding.tracks),
    observers: observerCounts(binding.tracks),
    nodes: binding.graph.nodes.map((node) => node.id).sort(),
  };
}

function expectRestored(binding, publisher, before, label) {
  expect(publisher.graphOrder, `${label}: publish order changed`).toEqual(before.order);
  expect(declaredEdgeKeys(binding.graph), `${label}: IR changed`).toEqual(before.declared);
  expect(liveEdgeKeys(binding.tracks), `${label}: live Track wiring changed`).toEqual(before.live);
  expect(observerCounts(binding.tracks), `${label}: reverse observer registry changed`).toEqual(before.observers);
  expect(binding.graph.nodes.map((node) => node.id).sort(), `${label}: node set changed`).toEqual(before.nodes);
}

describe("GraphBinding: addTrack rolls back at every failing edge index", () => {
  const observes = [
    { source: "n0", mapFn: (patch) => ({ from_n0: patch.transform }) },
    { source: "n1", mapFn: (patch) => ({ from_n1: patch.transform }) },
    { source: "n2", mapFn: (patch) => ({ from_n2: patch.transform }) },
  ];

  for (let failAt = 0; failAt < observes.length; failAt += 1) {
    it(`restores the exact prior state when wiring fails on edge ${failAt}`, () => {
      const { binding, publisher, published } = bind(chainMotion(3));
      publisher.markAllDirty();
      publisher.flush();
      published.length = 0;
      const before = snapshot(binding, publisher);

      const late = makeTrack("late");
      const realSetObserved = late.setObserved.bind(late);
      let calls = 0;
      late.setObserved = (...args) => {
        if (calls++ === failAt) throw new Error(`wire failed at ${failAt}`);
        return realSetObserved(...args);
      };

      expect(() => binding.addTrack(late, observes)).toThrow(`wire failed at ${failAt}`);

      expectRestored(binding, publisher, before, `failAt ${failAt}`);
      expect(binding.tracks.has("late")).toBe(false);
      expect(late.observedEdges, "the rejected track kept a live edge").toHaveLength(0);
      publisher.markDirty("n0");
      publisher.flush();
      expect(published).toEqual(["n0", "n1", "n2"]);
    });
  }

  it("registers nothing when a source cannot be resolved", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const before = snapshot(binding, publisher);
    const late = makeTrack("late");

    expect(() => binding.addTrack(late, [{ source: "n0" }, { source: "ghost" }])).toThrow(/rejected graph mutation|unknown source/i);

    expectRestored(binding, publisher, before, "unresolved source");
    expect(late.observedEdges).toHaveLength(0);
    expect(binding.tracks.has("late")).toBe(false);
  });

  it("still commits a fully wired late track", () => {
    const { binding, publisher, published } = bind(chainMotion(3));

    binding.addTrack(makeTrack("late"), observes);

    expect(publisher.graphOrder).toEqual(["n0", "n1", "n2", "late"]);
    expect(liveEdgeKeys(binding.tracks)).toEqual(declaredEdgeKeys(binding.graph));
    published.length = 0;
    publisher.markDirty("n0");
    publisher.flush();
    expect(published).toEqual(["n0", "n1", "n2", "late"]);
  });
});

describe("GraphBinding: rolls back when the publisher rejects the commit", () => {
  function failNextApply(publisher) {
    const real = publisher.applyGraph.bind(publisher);
    let armed = true;
    publisher.applyGraph = (...args) => {
      if (armed) { armed = false; throw new Error("publisher rejected the candidate"); }
      return real(...args);
    };
  }

  it("unwires an edge it had just added", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const before = snapshot(binding, publisher);
    failNextApply(publisher);

    expect(() => binding.addEdge({ source: "n0", target: "n2", role: "output", mapFn: (patch) => ({ from_n0: patch.transform }) })).toThrow(/publisher rejected/);

    expectRestored(binding, publisher, before, "addEdge");
  });

  it("reattaches an edge it had just removed, mapFn included", () => {
    const { binding, publisher, tracks } = bind(chainMotion(3));
    const before = snapshot(binding, publisher);
    tracks.get("n1").progress(0.5);
    const patchBefore = tracks.get("n2").compose();
    failNextApply(publisher);

    expect(() => binding.removeEdge({ source: "n1", target: "n2", role: "output" })).toThrow(/publisher rejected/);

    expectRestored(binding, publisher, before, "removeEdge");
    expect(tracks.get("n2").compose()).toEqual(patchBefore);
    expect(tracks.get("n2").compose().from_n1).toBeDefined();
  });

  it("puts a rewired observer back on its original source", () => {
    const { binding, publisher, tracks } = bind(chainMotion(4));
    const before = snapshot(binding, publisher);
    failNextApply(publisher);

    expect(() => binding.replaceEdge(
      { source: "n1", target: "n2", role: "output" },
      { source: "n0", target: "n2", role: "output", mapFn: (patch) => ({ from_n0: patch.transform }) },
    )).toThrow(/publisher rejected/);

    expectRestored(binding, publisher, before, "replaceEdge");
    expect(tracks.get("n2").observedSources).toEqual([tracks.get("n1")]);
  });

  it("leaves a working binding behind, not a wedged one", () => {
    const { binding, publisher, published } = bind(chainMotion(3));
    failNextApply(publisher);

    expect(() => binding.addEdge({ source: "n0", target: "n2", role: "output", mapFn: (patch) => patch })).toThrow();

    binding.addEdge({ source: "n0", target: "n2", role: "output", mapFn: (patch) => ({ from_n0: patch.transform }) });

    expect(liveEdgeKeys(binding.tracks)).toEqual(declaredEdgeKeys(binding.graph));
    published.length = 0;
    publisher.markDirty("n0");
    publisher.flush();
    expect(published).toEqual(["n0", "n1", "n2"]);
  });
});

describe("GraphBinding: cycle rejection is failure-atomic", () => {
  it("preserves owner state, IR, publisher order, and live composition", () => {
    const { binding, publisher, tracks } = bind(chainMotion(3));
    tracks.get("n0").progress(0.4);
    tracks.get("n1").progress(0.6);
    const before = snapshot(binding, publisher);
    const ownerBefore = ownerEdgeKeys(binding);
    const compositionBefore = tracks.get("n2").compose();

    expect(() => binding.addEdge({
      source: "n2",
      target: "n0",
      role: "output",
      mapFn: (patch) => ({ from_n2: patch.transform }),
    })).toThrow(/cycle/i);

    expectRestored(binding, publisher, before, "rejected cycle");
    expect(ownerEdgeKeys(binding)).toEqual(ownerBefore);
    expect(tracks.get("n2").compose()).toEqual(compositionBefore);
  });
});

describe("GraphBinding: membership in both directions", () => {
  it("rejects construction when a declared node has no live Track", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const partial = new Map(tracks);
    partial.delete("n2");

    expect(() => new GraphBinding({ graph, tracks: partial, publisher })).toThrow(/declares node 'n2' with no live Track/i);
  });

  it("rejects construction when it holds a Track the graph does not declare", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const extra = new Map(tracks).set("ghost", makeTrack("ghost"));

    expect(() => new GraphBinding({ graph, tracks: extra, publisher })).toThrow(/holds Track 'ghost'/i);
  });
});
