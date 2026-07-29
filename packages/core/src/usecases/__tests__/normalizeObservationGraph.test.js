import { describe, expect, it } from "vitest";
import { normalizeObservationGraph, topologicalTrackOrder } from "../normalizeObservationGraph.js";

describe("observation graph normalization", () => {
  it("returns stable parent-before-child order and immutable JSON-safe IR", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "child", observes: [{ source: "parent", role: "input", target: "parentWorld" }] },
        { id: "parent" },
      ],
    });
    expect(topologicalTrackOrder(graph)).toEqual(["parent", "child"]);
    expect(graph.edges[0]).toMatchObject({ source: "parent", target: "child", role: "input", input: "parentWorld" });
    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.errors).toEqual([]);
  });

  it("reports cycles before runtime mounting", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "a", observes: [{ source: "b" }] },
      { id: "b", observes: [{ source: "a" }] },
    ] });
    expect(graph.order).toEqual([]);
    expect(graph.errors.some((error) => error.ruleId === "track-observations-cycle")).toBe(true);
  });

  it("preserves authored track order for independent nodes", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "z" }, { id: "a" }, { id: "m" }] });
    expect(graph.order).toEqual(["z", "a", "m"]);
  });
});
