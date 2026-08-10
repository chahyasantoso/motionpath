import { describe, expect, it } from "vitest";
import { ObservationStateBridge } from "../ObservationStateBridge.js";

function track(id, observedEdges = []) {
  return {
    id,
    observedEdges,
    getSnapshot: () => ({ id }),
    compose: () => ({ id }),
  };
}

describe("P2-03 ObservationState bridge", () => {
  it("mirrors live Track edges into owned observation state", () => {
    const source = track("source");
    const target = track("target", [
      { source, role: "output", input: undefined, mapFn: null },
    ]);
    const bridge = new ObservationStateBridge({
      tracks: new Map([
        [source.id, source],
        [target.id, target],
      ]),
    });
    expect(bridge.state.getSources("target")).toEqual(["source"]);
    expect(bridge.assertParity()).toBe(true);
  });

  it("fails loudly when live wiring drifts", () => {
    const source = track("source");
    const target = track("target", [
      { source, role: "output", input: undefined, mapFn: null },
    ]);
    const bridge = new ObservationStateBridge({
      tracks: new Map([
        [source.id, source],
        [target.id, target],
      ]),
    });
    target.observedEdges = [];
    expect(() => bridge.assertParity()).toThrow(/parity/i);
  });

  it("does not collide composite edge identities", () => {
    const sourceA = track("A");
    const sourceAB = track("AB");
    const targetBC = track("BC", [
      { source: sourceA, role: "output", input: undefined, mapFn: null },
    ]);
    const targetC = track("C", [
      { source: sourceAB, role: "output", input: undefined, mapFn: null },
    ]);
    const bridge = new ObservationStateBridge({
      tracks: new Map([
        [sourceA.id, sourceA],
        [sourceAB.id, sourceAB],
        [targetBC.id, targetBC],
        [targetC.id, targetC],
      ]),
    });
    expect(bridge.assertParity()).toBe(true);
  });
});
