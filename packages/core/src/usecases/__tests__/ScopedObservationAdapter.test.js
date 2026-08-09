import { describe, expect, it } from "vitest";
import { ScopedObservationAdapter } from "../ScopedObservationAdapter.js";

function track(id, leaf = id) {
  return { id, getSnapshot: () => ({ leaf }), composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }) };
}

describe("P2-03 scoped adapter harness", () => {
  it("isolates duplicate public IDs between adapter instances", () => {
    const left = track("bone", "left");
    const right = track("bone", "right");
    const first = new ScopedObservationAdapter({ tracks: [left] });
    const second = new ScopedObservationAdapter({ tracks: [right] });

    first.setObserved(left, right, (patch) => ({ fromRight: patch.leaf }));
    expect(first.getSources(left)).toEqual([right]);
    expect(second.getSources(right)).toEqual([]);
    expect(first.compose(left)).toEqual({ leaf: "left", fromRight: "right" });
    first.destroy();
    expect(second.compose(right)).toEqual({ leaf: "right" });
    second.destroy();
  });

  it("keeps lifecycle local and rejects use after destroy", () => {
    const adapter = new ScopedObservationAdapter({ tracks: [track("one")] });
    adapter.destroy();
    expect(adapter.isDestroyed).toBe(true);
    expect(() => adapter.register(track("two"))).toThrow(/destroyed/i);
  });
});
