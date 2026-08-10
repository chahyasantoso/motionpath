import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { makeTrack } from "../../__fixtures__/graphTracks.js";
import { normalizeObservationGraph } from "../normalizeObservationGraph.js";

describe("P2-03 GraphBinding initial wiring", () => {
  it("installs authored edges and composition ownership in one binding step", () => {
    const motion = {
      tracks: [
        { id: "n0" },
        { id: "n1", observes: [{ source: "n0" }] },
        { id: "n2", observes: [{ source: "n1" }] },
      ],
    };
    const graph = normalizeObservationGraph(motion);
    const tracks = new Map(["n0", "n1", "n2"].map((id) => [id, makeTrack(id)]));
    const initialEdges = graph.edges.map((edge) => ({
      ...edge,
      mapFn: (patch) => ({ [`from_${edge.source}`]: patch.transform }),
    }));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const binding = new GraphBinding({
      graph,
      tracks,
      publisher,
      initialEdges,
    });

    expect(tracks.get("n1").observedSources).toEqual([tracks.get("n0")]);
    expect(tracks.get("n2").observedSources).toEqual([tracks.get("n1")]);
    expect(binding.observationState.getSources("n2")).toEqual(["n1"]);
    expect(binding.observationState).toBeTruthy();
    binding.destroy();
  });
});
