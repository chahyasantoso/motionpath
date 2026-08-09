import { describe, expect, it } from "vitest";
import { ObservationState } from "../ObservationState.js";
import { ObservationTrackController } from "../ObservationTrackController.js";

function track(id, leaf = id) {
  return { id, getSnapshot: () => ({ leaf }), composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }) };
}

describe("P2-03 ObservationTrackController", () => {
  function setup() {
    const source = track("source", "s");
    const observer = track("observer", "o");
    const tracks = new Map([[source.id, source], [observer.id, observer]]);
    const state = new ObservationState({ tracks, validateCycles: false });
    return { source, observer, state, controller: new ObservationTrackController({ state, tracks }) };
  }

  it("owns edge mutation and preserves input/output identity", () => {
    const { source, observer, controller } = setup();
    controller.setObserved(observer, source, () => ({ injected: true }), { role: "input", target: "target" });
    controller.setObserved(observer, source, (patch) => ({ from: patch.leaf }), { role: "output" });

    expect(controller.getSources(observer)).toEqual([source]);
    expect(controller.getEdges(observer)).toHaveLength(2);
    expect(controller.getObserverIds(source)).toEqual(["observer"]);
  });

  it("replaces, removes, clears, and composes through owner state", () => {
    const { source, observer, controller } = setup();
    const replacement = track("replacement", "r");
    controller.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    controller.replaceObserved(observer, source, replacement, (patch) => ({ from: patch.leaf }));
    expect(controller.getSources(observer)).toEqual([replacement]);
    expect(controller.compose(observer)).toEqual({ leaf: "o", from: "r" });

    controller.removeObserved(observer, replacement);
    expect(controller.getEdges(observer)).toEqual([]);
    controller.setObserved(observer, source, null);
    controller.clearObserved(observer);
    expect(controller.getObserverIds(source)).toEqual([]);
  });

  it("does not depend on Track reverse observer state", () => {
    const { source, observer, controller } = setup();
    controller.setObserved(observer, source, null);
    expect(source.observerIds).toBeUndefined();
    expect(controller.getObserverIds(source)).toEqual(["observer"]);
  });
});
