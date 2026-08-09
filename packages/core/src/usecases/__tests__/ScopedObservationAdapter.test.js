import { describe, expect, it } from "vitest";
import { ScopedObservationAdapter } from "../ScopedObservationAdapter.js";

function track(id, leaf = id) {
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }),
  };
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

  it("supports the COMPOSING fallback for a mutual edge", () => {
    const a = track("a");
    const b = track("b");
    const adapter = new ScopedObservationAdapter({ tracks: [a, b] });
    adapter.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));
    expect(() => adapter.compose(a)).not.toThrow();
    expect(adapter.compose(a)).toEqual({ leaf: "a", fromB: "b" });
    adapter.destroy();
  });

  it("keeps lifecycle local and rejects use after destroy", () => {
    const adapter = new ScopedObservationAdapter({ tracks: [track("one")] });
    adapter.destroy();
    expect(adapter.isDestroyed).toBe(true);
    expect(() => adapter.register(track("two"))).toThrow(/destroyed/i);
  });
});
