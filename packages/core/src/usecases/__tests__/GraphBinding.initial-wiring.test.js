import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

describe("P2-03 GraphBinding initial wiring", () => {
  it("installs authored edges and composition ownership in one binding step", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    for (const track of tracks.values()) track.removeObserved?.(track.observedSources[0]);
    const initialEdges = graph.edges.map((edge) => ({
      ...edge,
      mapFn: (patch) => ({ [`from_${edge.source}`]: patch.transform }),
    }));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const binding = new GraphBinding({ graph, tracks, publisher, initialEdges });

    expect(tracks.get("n1").observedSources).toEqual([tracks.get("n0")]);
    expect(tracks.get("n2").observedSources).toEqual([tracks.get("n1")]);
    expect(binding.observationState.getSources("n2")).toEqual(["n1"]);
    expect(binding.observationState).toBeTruthy();
    binding.destroy();
  });
});
