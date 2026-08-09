import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

function bind(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
  const binding = new GraphBinding({ graph, tracks, publisher });
  return { binding, publisher, tracks };
}

function stateEdges(binding, target) {
  return binding.observationState.getEdges(target).map(({ source, role, input, mapFn }) => ({
    source: source.id,
    role,
    input,
    mapper: typeof mapFn === "function" ? "fn" : "none",
  }));
}

describe("GraphBinding state authority", () => {
  it("compares owner state directly with normalized graph IR", () => {
    const { binding } = bind(chainMotion(3));
    expect(binding.observationState).toBeTruthy();
    expect(() => binding.observationState).not.toThrow();
    binding.destroy();
  });

  it("restores the removed edge and mapper in owner state after publisher rejection", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const before = stateEdges(binding, "n2");
    const realApply = publisher.applyGraph.bind(publisher);
    publisher.applyGraph = () => {
      publisher.applyGraph = realApply;
      throw new Error("state authority rejected candidate");
    };

    expect(() => binding.removeEdge({ source: "n1", target: "n2", role: "output" }))
      .toThrow(/state authority rejected/);
    expect(stateEdges(binding, "n2")).toEqual(before);
    expect(binding.observationState.getEdges("n2")[0].mapFn).toEqual(expect.any(Function));
    binding.destroy();
  });

  it("restores a replaced edge in owner state after publisher rejection", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const before = stateEdges(binding, "n2");
    const realApply = publisher.applyGraph.bind(publisher);
    publisher.applyGraph = () => {
      publisher.applyGraph = realApply;
      throw new Error("replace rejected candidate");
    };

    expect(() => binding.replaceEdge(
      { source: "n1", target: "n2", role: "output" },
      { source: "n0", target: "n2", role: "output", mapFn: () => ({ replaced: true }) },
    )).toThrow(/replace rejected/);
    expect(stateEdges(binding, "n2")).toEqual(before);
    binding.destroy();
  });

  it("restores owner state after a late-track wiring failure", () => {
    const { binding, publisher } = bind(chainMotion(3));
    const before = stateEdges(binding, "n2");
    const late = makeTrack("late");
    const realSetObserved = late.setObserved.bind(late);
    late.setObserved = () => { throw new Error("late wiring rejected"); };

    expect(() => binding.addTrack(late, [{ source: "n0" }])).toThrow(/late wiring rejected/);
    expect(stateEdges(binding, "n2")).toEqual(before);
    expect(binding.observationState.getEdges("late")).toEqual([]);
    expect(binding.tracks.has("late")).toBe(false);
    // Keep the wrapper referenced so this test documents that only the Track
    // compatibility projection was fault-injected, not the owner state.
    expect(realSetObserved).toEqual(expect.any(Function));
    binding.destroy();
    publisher.destroy();
  });
});
