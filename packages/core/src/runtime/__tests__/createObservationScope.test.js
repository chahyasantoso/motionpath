import { describe, expect, it } from "vitest";
import { createObservationScope } from "../createObservationScope.js";

function track(id) {
  return { id, getSnapshot: () => ({ id }), composeLocal: (raw) => raw ?? { id } };
}

describe("caller-owned observation scope", () => {
  it("isolates duplicate IDs between independent direct scopes", () => {
    const left = createObservationScope();
    const right = createObservationScope();
    const leftSource = track("source");
    const leftTarget = track("target");
    const rightSource = track("source");
    const rightTarget = track("target");

    left.standaloneObservationAdapter.setObserved(leftTarget, leftSource, (patch) => ({ left: patch.id }));
    right.standaloneObservationAdapter.setObserved(rightTarget, rightSource, (patch) => ({ right: patch.id }));

    expect(left.standaloneObservationAdapter.getSources(leftTarget)).toEqual([leftSource]);
    expect(right.standaloneObservationAdapter.getSources(rightTarget)).toEqual([rightSource]);
    left.dispose();
    expect(right.standaloneObservationAdapter.getSources(rightTarget)).toEqual([rightSource]);
    right.dispose();
  });
});
