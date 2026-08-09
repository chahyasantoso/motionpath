import { describe, expect, it } from "vitest";
import { ScopedObservationAdapter } from "../ScopedObservationAdapter.js";

function track(id, leaf = id, composeSpy = () => {}) {
  return {
    id,
    getSnapshot: () => ({ leaf }),
    composeLocal: (raw) => {
      composeSpy(id);
      return { leaf: raw?.leaf ?? leaf };
    },
  };
}

function edges(adapter, track) {
  return adapter.getEdges(track).map(({ source, role, input }) => ({
    source: source.id,
    role,
    input,
  }));
}

describe("P2-03 scoped adapter parity", () => {
  it("preserves the locked output-fold result and edge shape", () => {
    const source = track("source", "s");
    const observer = track("observer", "o");
    const adapter = new ScopedObservationAdapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    expect(adapter.compose(observer)).toEqual({ leaf: "o", from: "s" });
    expect(edges(adapter, observer)).toEqual([{ source: "source", role: "output", input: undefined }]);
    adapter.destroy();
  });

  it("preserves input-before-local ordering and output-after-local ordering", () => {
    const source = track("source", "s");
    const target = track("target", "base");
    const adapter = new ScopedObservationAdapter({ tracks: [source, target] });
    adapter.setObserved(target, source, () => ({ leaf: "input" }), { role: "input", target: "target" });
    adapter.setObserved(target, source, (patch) => ({ from: patch.leaf }), { role: "output" });
    expect(adapter.compose(target)).toEqual({ leaf: "input", from: "s" });
    adapter.destroy();
  });

  it("preserves repeated mapper replacement and observer IDs", () => {
    const source = track("source");
    const observer = track("observer");
    const adapter = new ScopedObservationAdapter({ tracks: [source, observer] });
    adapter.setObserved(observer, source, () => ({ value: "first" }));
    adapter.setObserved(observer, source, () => ({ value: "second" }));
    expect(adapter.compose(observer).value).toBe("second");
    expect(adapter.getEdges(observer)).toHaveLength(1);
    expect(adapter.getObserverIds(source)).toEqual(["observer"]);
    adapter.removeObserved(observer, source);
    expect(adapter.getObserverIds(source)).toEqual([]);
    adapter.destroy();
  });

  it("preserves mutual-cycle fallback and diamond memoization", () => {
    const calls = [];
    const a = track("a", "a", (id) => calls.push(id));
    const b = track("b", "b", (id) => calls.push(id));
    const c = track("c", "c", (id) => calls.push(id));
    const d = track("d", "d", (id) => calls.push(id));
    const adapter = new ScopedObservationAdapter({ tracks: [a, b, c, d] });
    adapter.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));
    expect(adapter.compose(a)).toEqual({ leaf: "a", fromB: "b" });
    adapter.setObserved(c, d, (patch) => ({ fromD: patch.leaf }));
    adapter.setObserved(b, c, (patch) => ({ fromC: patch.leaf }));
    adapter.compose(b);
    expect(calls.filter((id) => id === "d")).toHaveLength(1);
    adapter.destroy();
  });
});
