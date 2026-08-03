/**
 * GraphBinding is the bridge the system was missing: authored IR, live Track
 * edges and publisher order could previously drift after any runtime mutation.
 * These tests assert they agree, and that a rejected mutation changes nothing.
 */
import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion, diamondMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

function bind(motion) {
  const { graph, tracks, composeCounts } = buildRealGraph(motion);
  const published = [];
  const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
  const binding = new GraphBinding({ graph, tracks, publisher });
  return { graph, tracks, publisher, binding, published, composeCounts };
}

describe("GraphBinding — representations agree", () => {
  it("accepts a graph whose live Track edges match the normalized IR", () => {
    const { binding, graph } = bind(diamondMotion());
    expect(binding.graph.order).toEqual([...graph.order]);
    expect(binding.graph.edges).toHaveLength(graph.edges.length);
  });

  it("rejects construction when live edges do not match the IR", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    tracks.get("n0").setObserved(tracks.get("n2"), () => ({}), { role: "output" });
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    expect(() => new GraphBinding({ graph, tracks, publisher })).toThrow(/live Track wiring|declared edges|mismatch/i);
  });
});

describe("GraphBinding — atomic mutation", () => {
  it("rewires an edge and keeps publisher order valid", () => {
    const { binding, publisher, published } = bind(chainMotion(4));
    binding.replaceEdge({ source: "n1", target: "n2", role: "output" }, { source: "n0", target: "n2", role: "output" });
    const order = publisher.graphOrder;
    expect(order.indexOf("n0")).toBeLessThan(order.indexOf("n2"));
    published.length = 0;
    publisher.markDirty("n0");
    publisher.flush();
    expect(published).toContain("n2");
  });

  it("registers a late track together with its edges", () => {
    const { binding, publisher, published } = bind(chainMotion(2));
    binding.addTrack(makeTrack("late"), [{ source: "n1", role: "output", mapFn: (patch) => ({ from_n1: patch.transform }) }]);
    expect(publisher.graphOrder).toEqual(["n0", "n1", "late"]);
    published.length = 0;
    publisher.markDirty("n0");
    publisher.flush();
    expect(published).toEqual(["n0", "n1", "late"]);
  });

  it("leaves both Track state and publisher state untouched when a mutation is invalid", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const orderBefore = publisher.graphOrder;
    expect(() => binding.addEdge({ source: "n2", target: "n0", role: "output" })).toThrow();
    expect(publisher.graphOrder).toEqual(orderBefore);
    expect(binding.graph.edges.some((edge) => edge.source === "n2" && edge.target === "n0")).toBe(false);
  });

  it("drops a removed track from the graph and stops composing it", () => {
    const { binding, publisher, composeCounts } = bind(chainMotion(3));
    binding.removeTrack("n2");
    expect(publisher.graphOrder).not.toContain("n2");
    expect(binding.tracks.get("n2")).toBeUndefined();
    const before = composeCounts.get("n2") ?? 0;
    publisher.markDirty("n0");
    publisher.flush();
    expect(composeCounts.get("n2") ?? 0).toBe(before);
  });
});

describe("GraphBinding — lifecycle", () => {
  it("removes a destroyed track from the graph without a dangling observer", () => {
    const { binding, publisher, tracks } = bind(chainMotion(3));
    const n1 = tracks.get("n1");
    const n2 = tracks.get("n2");
    n1.destroy();
    expect(publisher.graphOrder).not.toContain("n1");
    expect(n2.observedSources).toHaveLength(0);
    expect(() => publisher.flush()).not.toThrow();
    expect(binding.graph.edges.every((edge) => edge.source !== "n1" && edge.target !== "n1")).toBe(true);
  });

  it("stops forwarding invalidation once destroyed", () => {
    const { binding, publisher, tracks, published } = bind(chainMotion(2));
    publisher.markAllDirty();
    publisher.flush();
    binding.destroy();
    published.length = 0;
    tracks.get("n0").progress(0.5);
    expect(() => binding.addEdge({ source: "n0", target: "n1", role: "output" })).toThrow(/destroyed/i);
    expect(published).toEqual([]);
  });
});
