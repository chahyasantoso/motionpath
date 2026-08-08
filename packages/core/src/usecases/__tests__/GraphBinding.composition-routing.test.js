import { describe, expect, it, vi } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function bind(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
  const binding = new GraphBinding({ graph, tracks, publisher });
  return { binding, tracks };
}

describe("P2-03 Track composition routing", () => {
  it("routes graph-bound Track.compose through the ObservationState handle", () => {
    const { binding, tracks } = bind(chainMotion(3));
    const state = binding.observationState;
    const compose = vi.spyOn(state, "compose");

    const patch = tracks.get("n2").compose();

    expect(compose).toHaveBeenCalledWith("n2", undefined, expect.any(Map), expect.any(Function));
    expect(patch).toEqual(state.compose("n2", undefined, new Map(), (track, rawData) => track.composeLocal(rawData)));
    binding.destroy();
  });

  it("rebinds composition after a transactional graph refresh", () => {
    const { binding, tracks } = bind(chainMotion(3));
    const previousState = binding.observationState;

    binding.addEdge({ source: "n0", target: "n2", role: "output", mapFn: (patch) => ({ direct: patch.transform }) });

    expect(previousState.isDestroyed).toBe(true);
    const currentState = binding.observationState;
    const compose = vi.spyOn(currentState, "compose");
    tracks.get("n2").compose();
    expect(compose).toHaveBeenCalled();
    expect(binding.observationState).toBe(currentState);
    binding.destroy();
  });

  it("unbinds safely so standalone composition remains available after binding disposal", () => {
    const { binding, tracks } = bind(chainMotion(2));
    const track = tracks.get("n1");
    const before = track.compose();

    binding.destroy();

    expect(binding.observationState).toBeNull();
    expect(track.compose()).toEqual(before);
  });
});
