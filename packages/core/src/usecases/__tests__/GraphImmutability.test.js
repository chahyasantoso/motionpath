import { describe, expect, it } from "vitest";
import { normalizeObservationGraph } from "../normalizeObservationGraph.js";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function buildBinding(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
  return new GraphBinding({ graph, tracks, publisher });
}

describe("P2-01 graph value immutability", () => {
  it("freezes normalized graph containers and every record inside them", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "a" }, { id: "b", observes: [{ source: "a" }] }] });
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(Object.isFrozen(graph.nodes[0])).toBe(true);
    expect(Object.isFrozen(graph.edges)).toBe(true);
    expect(Object.isFrozen(graph.edges[0])).toBe(true);
    expect(Object.isFrozen(graph.order)).toBe(true);
  });

  it("rejects mutation of a normalized graph through any reachable path", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "a" }, { id: "b", observes: [{ source: "a" }] }] });
    expect(() => { graph.nodes.push({ id: "c" }); }).toThrow(TypeError);
    expect(() => { graph.edges[0].source = "hacked"; }).toThrow(TypeError);
    expect(() => { graph.order.push("c"); }).toThrow(TypeError);
    expect(graph.edges[0].source).toBe("a");
  });

  it("freezes diagnostics on an invalid graph", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "a", observes: [{ source: "missing" }] }] });
    expect(graph.valid).toBe(false);
    expect(Object.isFrozen(graph.errors)).toBe(true);
    expect(Object.isFrozen(graph.errors[0])).toBe(true);
    expect(() => { graph.errors[0].message = ""; }).toThrow(TypeError);
  });

  it("hands GraphBinding consumers a deeply frozen snapshot, not a frozen wrapper", () => {
    const binding = buildBinding(chainMotion(3));
    try {
      const snapshot = binding.graph;
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.nodes)).toBe(true);
      expect(Object.isFrozen(snapshot.nodes[0])).toBe(true);
      expect(Object.isFrozen(snapshot.edges)).toBe(true);
      expect(Object.isFrozen(snapshot.edges[0])).toBe(true);
      expect(Object.isFrozen(snapshot.order)).toBe(true);
      expect(() => { snapshot.nodes.push({ id: "injected" }); }).toThrow(TypeError);
      expect(() => { snapshot.edges[0].target = "hacked"; }).toThrow(TypeError);
      expect(() => { snapshot.order.push("injected"); }).toThrow(TypeError);
    } finally {
      binding.destroy();
    }
  });

  it("keeps the snapshot frozen after a committed mutation", () => {
    const binding = buildBinding(chainMotion(3));
    try {
      binding.removeEdge({ source: "n1", target: "n2", role: "output" });
      const snapshot = binding.graph;
      expect(Object.isFrozen(snapshot.nodes)).toBe(true);
      expect(Object.isFrozen(snapshot.edges)).toBe(true);
      expect(() => { snapshot.nodes.push({ id: "injected" }); }).toThrow(TypeError);
    } finally {
      binding.destroy();
    }
  });
});
