import { describe, expect, it } from "vitest";
import { normalizeObservationGraph } from "../normalizeObservationGraph.js";
import { ObservationGraph } from "../ObservationGraph.js";

describe("ObservationGraph", () => {
  it("owns immutable nodes, edges, and canonical order", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "source" }, { id: "sink", observes: [{ source: "source", role: "output" }] }] });
    expect(graph).toBeInstanceOf(ObservationGraph);
    expect(graph.valid).toBe(true);
    expect(graph.nodeIds).toEqual(["source", "sink"]);
    expect(graph.order).toEqual(["source", "sink"]);
    expect(graph.edgeKeys()).toEqual(["source->sink:output:"]);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.edges[0])).toBe(true);
  });
  it("preserves invalid graph diagnostics without exposing partial semantics", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "a", observes: [{ source: "b" }] }] });
    expect(graph.valid).toBe(false);
    expect(graph.errors.length).toBeGreaterThan(0);
    expect(graph.toJSON().valid).toBe(false);
  });
  it("answers direct downstream membership without Track references", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "a" }, { id: "b", observes: [{ source: "a" }] }, { id: "c", observes: [{ source: "b" }] }] });
    expect(graph.downstreamOf("a")).toEqual(["b"]);
    expect(graph.hasNode("c")).toBe(true);
  });
});
