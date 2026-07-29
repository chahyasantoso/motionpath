import { describe, expect, it } from "vitest";
import { normalizeObservationGraph, topologicalTrackOrder } from "../normalizeObservationGraph.js";

describe("observation graph normalization", () => {
  it("returns stable parent-before-child order and immutable JSON-safe IR", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "child", observes: [{ source: "parent", role: "input", target: "parentWorld" }] },
      { id: "parent" },
    ] });
    expect(topologicalTrackOrder(graph)).toEqual(["parent", "child"]);
    expect(graph.edges[0]).toMatchObject({ source: "parent", target: "child", role: "input", input: "parentWorld" });
    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.errors).toEqual([]);
  });

  it("keeps diamond dependencies deterministic", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "leaf", observes: [{ source: "left" }, { source: "right" }] },
      { id: "right", observes: [{ source: "root" }] },
      { id: "root" },
      { id: "left", observes: [{ source: "root" }] },
    ] });
    expect(graph.errors).toEqual([]);
    expect(graph.order).toEqual(["root", "right", "left", "leaf"]);
  });

  it("reports cycles before runtime mounting", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "a", observes: [{ source: "b" }] },
      { id: "b", observes: [{ source: "a" }] },
    ] });
    expect(graph.order).toEqual([]);
    expect(graph.errors.some((error) => error.ruleId === "track-observations-cycle")).toBe(true);
  });

  it("reports duplicate nodes and edges without corrupting the IR", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "parent" },
      { id: "child", observes: [
        { source: "parent", role: "input", target: "parentWorld" },
        { source: "parent", role: "input", target: "parentWorld" },
      ] },
      { id: "child" },
    ] });
    expect(graph.nodes.map((node) => node.id)).toEqual(["parent", "child"]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.errors.map((error) => error.ruleId)).toEqual([
      "track-observations-duplicate-edge",
      "track-observations-duplicate-node",
    ]);
  });

  it("reports invalid targets and roles", () => {
    const graph = normalizeObservationGraph({ tracks: [
      { id: "child", observes: [
        { source: "missing", role: "input", target: "parentWorld" },
        { source: "child", role: "sideways" },
      ] },
    ] });
    expect(graph.errors.map((error) => error.ruleId)).toEqual([
      "track-observations",
      "track-observations-cycle",
    ]);
  });

  it("preserves authored track order for independent nodes", () => {
    const graph = normalizeObservationGraph({ tracks: [{ id: "z" }, { id: "a" }, { id: "m" }] });
    expect(graph.order).toEqual(["z", "a", "m"]);
  });
});
