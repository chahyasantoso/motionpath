import { describe, expect, it, vi } from "vitest";
import { StandaloneObservationAdapter } from "../StandaloneObservationAdapter.js";

function track(id, leaf = id, onCompose = () => {}) {
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => {
      onCompose(id);
      return { leaf: raw?.leaf ?? leaf };
    },
  };
}

describe("P2-03 standalone composition protocol characterization", () => {
  it("preserves output folds and public context keys", () => {
    const source = track("source");
    const observer = track("observer");
    const adapter = new StandaloneObservationAdapter({ tracks: [source, observer] });
    const context = new Map();

    adapter.setObserved(observer, source, (patch) => ({ fromSource: patch.leaf }));

    expect(adapter.compose(observer, undefined, context)).toEqual({
      leaf: "observer",
      fromSource: "source",
    });
    expect([...context.keys()]).toEqual(["observer"]);
    adapter.destroy();
  });

  it("applies input folds before the local composer", () => {
    const source = track("source");
    const target = track("target", "base");
    const adapter = new StandaloneObservationAdapter({ tracks: [source, target] });

    adapter.setObserved(target, source, () => ({ leaf: "injected" }), {
      role: "input",
      target: "target",
    });

    expect(adapter.compose(target)).toEqual({ leaf: "injected" });
    adapter.destroy();
  });

  it("terminates mutual observation with the COMPOSING fallback", () => {
    const a = track("a");
    const b = track("b");
    const adapter = new StandaloneObservationAdapter({ tracks: [a, b] });

    adapter.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));

    expect(() => adapter.compose(a)).not.toThrow();
    expect(adapter.compose(a)).toEqual({ leaf: "a", fromB: "b", fromA: "a" });
    adapter.destroy();
  });

  it("memoizes a shared upstream once per compose call", () => {
    const calls = vi.fn();
    const a = track("a", "a", calls);
    const b = track("b", "b", calls);
    const c = track("c", "c", calls);
    const d = track("d", "d", calls);
    const adapter = new StandaloneObservationAdapter({ tracks: [a, b, c, d] });

    adapter.setObserved(b, a, (patch) => ({ fromA1: patch.leaf }));
    adapter.setObserved(c, a, (patch) => ({ fromA2: patch.leaf }));
    adapter.setObserved(d, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(d, c, (patch) => ({ fromC: patch.leaf }));

    adapter.compose(d);
    expect(calls).toHaveBeenCalledTimes(4);
    expect(calls.mock.calls.filter(([id]) => id === "a")).toHaveLength(1);
    adapter.destroy();
  });
});
