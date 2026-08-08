import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { ObservationStateBridge } from "../ObservationStateBridge.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function bind(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
  const binding = new GraphBinding({ graph, tracks, publisher });
  return { binding, publisher, tracks };
}

function assertParity(tracks) {
  return new ObservationStateBridge({ tracks }).assertParity();
}

describe("P2-03 GraphBinding and ObservationState parity", () => {
  it("starts in parity with the authored live graph", () => {
    const { binding, tracks } = bind(chainMotion(3));
    expect(assertParity(tracks)).toBe(true);
    binding.destroy();
  });

  it("keeps parity after add, remove, and replace transactions", () => {
    const { binding, tracks } = bind(chainMotion(4));
    binding.addEdge({ source: "n0", target: "n3", role: "output" });
    expect(assertParity(tracks)).toBe(true);
    binding.removeEdge({ source: "n0", target: "n3", role: "output" });
    expect(assertParity(tracks)).toBe(true);
    binding.replaceEdge(
      { source: "n1", target: "n2", role: "output" },
      { source: "n0", target: "n2", role: "output" },
    );
    expect(assertParity(tracks)).toBe(true);
    binding.destroy();
  });

  it("keeps parity after a rejected transaction", () => {
    const { binding, publisher, tracks } = bind(chainMotion(3));
    const apply = publisher.applyGraph.bind(publisher);
    publisher.applyGraph = () => { throw new Error("forced parity rejection"); };
    expect(() => binding.addEdge({ source: "n0", target: "n2" })).toThrow(/parity rejection/);
    publisher.applyGraph = apply;
    expect(assertParity(tracks)).toBe(true);
    binding.destroy();
  });
});
