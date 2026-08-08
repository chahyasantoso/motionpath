import { describe, expect, it } from "vitest";
import { StandaloneObservationAdapter } from "../StandaloneObservationAdapter.js";

function track(id, patch = { id }) {
  return { id, getSnapshot: () => ({ id }), composeLocal: () => patch };
}

describe("P2-03 StandaloneObservationAdapter", () => {
  it("owns standalone edges and preserves mutual observation", () => {
    const a = track("a", { leaf: "a" });
    const b = track("b", { leaf: "b" });
    const adapter = new StandaloneObservationAdapter({ tracks: [a, b] });

    adapter.setObserved(a, b, (patch) => ({ fromB: patch.leaf }));
    adapter.setObserved(b, a, (patch) => ({ fromA: patch.leaf }));

    expect(adapter.compose(a)).toEqual({ leaf: "a", fromB: "b" });
    expect(adapter.compose(b)).toEqual({ leaf: "b", fromA: "a" });
    adapter.destroy();
  });

  it("supports input and output edges from one source", () => {
    const source = track("source", { value: 3 });
    const target = track("target", { value: 0 });
    const adapter = new StandaloneObservationAdapter({ tracks: [source, target] });

    adapter.setObserved(target, source, () => ({ value: 7 }), { role: "input", target: "target" });
    adapter.setObserved(target, source, () => ({ extra: true }), { role: "output" });

    expect(adapter.state.getEdges("target")).toHaveLength(2);
    adapter.destroy();
  });

  it("is explicit about lifecycle and does not expose mutable ownership maps", () => {
    const adapter = new StandaloneObservationAdapter({ tracks: [track("one")] });
    expect(adapter.tracks).toBeInstanceOf(Map);
    adapter.destroy();
    expect(() => adapter.compose(track("one"))).toThrow(/destroyed/i);
    expect(() => adapter.register(track("two"))).toThrow(/destroyed/i);
  });
});
