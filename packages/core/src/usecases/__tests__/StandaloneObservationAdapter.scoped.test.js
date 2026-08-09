import { describe, expect, it } from "vitest";
import { StandaloneObservationAdapter } from "../StandaloneObservationAdapter.js";

function track(id, leaf = id) {
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }),
  };
}

describe("P2-03 scoped standalone ownership", () => {
  it("keeps same public IDs isolated between adapter scopes", () => {
    const left = track("bone", "left");
    const right = track("bone", "right");
    const leftAdapter = new StandaloneObservationAdapter({ tracks: [left] });
    const rightAdapter = new StandaloneObservationAdapter({ tracks: [right] });

    leftAdapter.setObserved(left, right, (patch) => ({ fromRight: patch.leaf }));
    expect(leftAdapter.getSources(left)).toEqual([right]);
    expect(rightAdapter.getSources(right)).toEqual([]);
    expect(leftAdapter.compose(left)).toEqual({ leaf: "left", fromRight: "right" });

    leftAdapter.destroy();
    expect(rightAdapter.compose(right)).toEqual({ leaf: "right" });
    rightAdapter.destroy();
  });

  it("supports mutual observation without a process-global registry", () => {
    const a = track("a", "a");
    const b = track("b", "b");
    const adapterA = new StandaloneObservationAdapter({ tracks: [a] });
    const adapterB = new StandaloneObservationAdapter({ tracks: [b] });

    adapterA.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapterB.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));

    expect(adapterA.compose(a)).toEqual({ leaf: "a", fromB: "b", fromA: "a" });
    adapterA.destroy();
    adapterB.destroy();
  });

  it("does not leak an edge into a second scope after disposal", () => {
    const source = track("source");
    const observer = track("observer");
    const first = new StandaloneObservationAdapter({ tracks: [source, observer] });
    first.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    first.destroy();

    const freshSource = track("source", "fresh");
    const freshObserver = track("observer", "new");
    const second = new StandaloneObservationAdapter({ tracks: [freshSource, freshObserver] });
    expect(second.getSources(freshObserver)).toEqual([]);
    expect(second.compose(freshObserver)).toEqual({ leaf: "new" });
    second.destroy();
  });
});
