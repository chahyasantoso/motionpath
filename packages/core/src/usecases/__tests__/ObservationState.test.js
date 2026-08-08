import { describe, expect, it, vi } from "vitest";
import { ObservationState } from "../ObservationState.js";

function track(id) { return { id, getSnapshot: () => ({ id }), compose: () => ({ id }) }; }

function stateOf(...ids) { return new ObservationState({ tracks: new Map(ids.map((id) => [id, track(id)])) }); }

describe("P2-03 ObservationState", () => {
  it("owns forward edges and reverse observer indexes", () => {
    const state = stateOf("source", "target");
    state.addEdge({ source: "source", target: "target", role: "output", mapFn: (value) => value });
    expect(state.getSources("target")).toEqual(["source"]);
    expect(state.getObserverIds("source")).toEqual(["target"]);
    expect(state.getEdges("target")[0].source.id).toBe("source");
  });

  it("rejects cycles before mutating the state", () => {
    const state = stateOf("a", "b", "c");
    state.addEdge({ source: "a", target: "b" });
    state.addEdge({ source: "b", target: "c" });
    expect(() => state.addEdge({ source: "c", target: "a" })).toThrow(/cycle/i);
    expect(state.getSources("a")).toEqual([]);
  });

  it("replaces one edge atomically", () => {
    const state = stateOf("a", "b", "c");
    state.addEdge({ source: "a", target: "c" });
    state.replaceEdge({ source: "a", target: "c" }, { source: "b", target: "c" });
    expect(state.getSources("c")).toEqual(["b"]);
    expect(state.getObserverIds("a")).toEqual([]);
  });

  it("removes all edges when a source is unregistered", () => {
    const state = stateOf("a", "b", "c");
    state.addEdge({ source: "a", target: "b" });
    state.addEdge({ source: "a", target: "c" });
    state.unregister("a");
    expect(state.getSources("b")).toEqual([]);
    expect(state.getSources("c")).toEqual([]);
  });

  it("emits invalidation events without exposing its maps", () => {
    const invalidated = vi.fn();
    const state = new ObservationState({ tracks: new Map([["a", track("a")], ["b", track("b")]]), onInvalidate: invalidated });
    state.addEdge({ source: "a", target: "b" });
    state.removeEdge({ source: "a", target: "b" });
    expect(invalidated).toHaveBeenCalledTimes(2);
  });
});
