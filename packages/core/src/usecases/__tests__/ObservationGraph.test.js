import { describe, expect, it } from "vitest";
import { normalizeObservationGraph } from "../normalizeObservationGraph.js";
import { ObservationGraph } from "../ObservationGraph.js";
import { observationEdgeKey } from "../observationEdge.js";

describe("ObservationGraph", () => {
  it("owns immutable nodes, edges, and canonical order", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "source" },
        { id: "sink", observes: [{ source: "source", role: "output" }] },
      ],
    });
    expect(graph).toBeInstanceOf(ObservationGraph);
    expect(graph.valid).toBe(true);
    expect(graph.nodeIds).toEqual(["source", "sink"]);
    expect(graph.order).toEqual(["source", "sink"]);
    const expectedEdgeKey = [
      observationEdgeKey("source", "output", ""),
      "sink",
    ].join(String.fromCharCode(0));
    expect(graph.edgeKeys()).toEqual([expectedEdgeKey]);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.edges[0])).toBe(true);
  });
  it("preserves invalid graph diagnostics without exposing partial semantics", () => {
    const graph = normalizeObservationGraph({
      tracks: [{ id: "a", observes: [{ source: "b" }] }],
    });
    expect(graph.valid).toBe(false);
    expect(graph.errors.length).toBeGreaterThan(0);
    expect(graph.toJSON().valid).toBe(false);
  });
  it("answers direct upstream and downstream membership without Track references", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "a" },
        { id: "b", observes: [{ source: "a" }] },
        { id: "c", observes: [{ source: "b" }] },
      ],
    });
    expect(graph.downstreamOf("a")).toEqual(["b"]);
    expect(graph.upstreamOf("c")).toEqual(["b"]);
    expect(graph.hasEdge({ source: "a", target: "b", role: "output" })).toBe(
      true,
    );
    expect(graph.hasNode("c")).toBe(true);
  });
  it("keeps composite edge identities collision-proof", () => {
    expect(observationEdgeKey("A", "BC", "")).not.toBe(
      observationEdgeKey("AB", "C", ""),
    );
  });
});
