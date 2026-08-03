/**
 * PHASE 0 — RED BY DESIGN.
 *
 * Normalizer hardening from docs/V4.3-GRAPH-CORRECTNESS-PLAN.md §3.5.
 * Expected to fail until phase 5 lands.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeObservationGraph,
  topologicalTrackOrder,
} from "../normalizeObservationGraph.js";

describe("normalizeObservationGraph — strict order (D11)", () => {
  it("flags an invalid graph so callers cannot ignore diagnostics by accident", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "a", observes: [{ source: "b" }] },
        { id: "b", observes: [{ source: "a" }] },
      ],
    });

    expect(graph.valid).toBe(false);
    expect(graph.errors.some((e) => e.ruleId.includes("cycle"))).toBe(true);
  });

  it("refuses to hand out a partial order for a cyclic graph", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "root" },
        { id: "a", observes: [{ source: "root" }, { source: "b" }] },
        { id: "b", observes: [{ source: "a" }] },
      ],
    });

    // Today this silently returns ["root"], so a publisher built from it would
    // simply never compose a or b, with no error anywhere.
    expect(() => topologicalTrackOrder(graph)).toThrow(/cycle/i);
  });

  it("still returns the partial order when strict is explicitly disabled", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "root" },
        { id: "a", observes: [{ source: "root" }, { source: "b" }] },
        { id: "b", observes: [{ source: "a" }] },
      ],
    });

    expect(topologicalTrackOrder(graph, { strict: false })).toEqual(["root"]);
  });

  it("marks a well-formed graph valid", () => {
    const graph = normalizeObservationGraph({
      tracks: [{ id: "a" }, { id: "b", observes: [{ source: "a" }] }],
    });

    expect(graph.valid).toBe(true);
    expect(topologicalTrackOrder(graph)).toEqual(["a", "b"]);
  });
});

describe("normalizeObservationGraph — edge key collisions (D12)", () => {
  it("does not dedupe two distinct edges whose ids concatenate identically", () => {
    // Edge 1: source "A"  -> target "BC"  =>  "A"  + "BC" + role  = "ABCoutput"
    // Edge 2: source "AB" -> target "C"   =>  "AB" + "C"  + role  = "ABCoutput"
    // Same key, different edges. The second is silently dropped as a duplicate.
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "A" },
        { id: "AB" },
        { id: "BC", observes: [{ source: "A" }] },
        { id: "C", observes: [{ source: "AB" }] },
      ],
    });

    expect(graph.errors).toEqual([]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      "A->BC",
      "AB->C",
    ]);
  });

  it("still reports a genuine duplicate edge", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "a" },
        { id: "b", observes: [{ source: "a" }, { source: "a" }] },
      ],
    });

    expect(
      graph.errors.some((e) => e.ruleId === "track-observations-duplicate-edge"),
    ).toBe(true);
  });

  it("treats input and output edges between the same pair as distinct", () => {
    const graph = normalizeObservationGraph({
      tracks: [
        { id: "a" },
        {
          id: "b",
          observes: [
            { source: "a" },
            { source: "a", role: "input", target: "parentWorld" },
          ],
        },
      ],
    });

    expect(graph.errors).toEqual([]);
    expect(graph.edges).toHaveLength(2);
  });
});
