/**
 * PR-03, one canonical sorter.
 *
 * The normalizer carried its own copy of Kahn's algorithm. The publisher used
 * buildTopologicalOrder. Two implementations of the same thing means the order
 * a graph is validated against is not provably the order it is published in.
 */
import { describe, expect, it } from "vitest";
import { buildTopologicalOrder, normalizeObservationGraph, tryTopologicalOrder } from "../normalizeObservationGraph.js";
import { chainMotion, diamondMotion, randomDagMotion, seededRandom } from "../../__fixtures__/graphTracks.js";

function sortInputs(graph) {
  return {
    nodes: graph.nodes.map(({ id }) => ({ id })),
    edges: graph.edges.map(({ source, target }) => ({ source, target })),
  };
}

describe("observation graph sorting", () => {
  it("normalizes to exactly what the shared sorter produces", () => {
    for (const motion of [chainMotion(1), chainMotion(5), diamondMotion()]) {
      const graph = normalizeObservationGraph(motion);
      const { nodes, edges } = sortInputs(graph);
      expect([...graph.order]).toEqual(buildTopologicalOrder(nodes, edges));
    }
  });

  it("agrees with the shared sorter across random DAGs", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rand = seededRandom(seed + 60_000);
      const motion = randomDagMotion(3 + Math.floor(rand() * 10), 0.3, rand);
      const graph = normalizeObservationGraph(motion);
      const { nodes, edges } = sortInputs(graph);
      expect([...graph.order], `seed ${seed}`).toEqual(buildTopologicalOrder(nodes, edges));
    }
  });

  it("breaks ties by declaration position, deterministically", () => {
    const motion = { tracks: [{ id: "c" }, { id: "a" }, { id: "b" }] };

    expect([...normalizeObservationGraph(motion).order]).toEqual(["c", "a", "b"]);
    expect([...normalizeObservationGraph(motion).order]).toEqual([...normalizeObservationGraph(motion).order]);
  });

  it("reports a cycle where the normalizer must and throws where the publisher must", () => {
    const motion = { tracks: [{ id: "a", observes: [{ source: "b" }] }, { id: "b", observes: [{ source: "a" }] }] };
    const graph = normalizeObservationGraph(motion);

    expect(graph.valid).toBe(false);
    expect(graph.errors.some((error) => /cycle/i.test(error.message))).toBe(true);

    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "b", target: "a" }, { source: "a", target: "b" }];
    expect(() => buildTopologicalOrder(nodes, edges)).toThrow(/cycle/i);
    expect(tryTopologicalOrder(nodes, edges)).toEqual({ order: [], complete: false });
  });

  it("returns the partial order it managed to build alongside the cycle", () => {
    const nodes = [{ id: "root" }, { id: "a" }, { id: "b" }];
    const edges = [{ source: "b", target: "a" }, { source: "a", target: "b" }];

    expect(tryTopologicalOrder(nodes, edges)).toEqual({ order: ["root"], complete: false });
  });

  it("still refuses an edge that names a track it has never seen", () => {
    expect(() => tryTopologicalOrder([{ id: "a" }], [{ source: "ghost", target: "a" }])).toThrow(/unknown track/i);
  });
});
