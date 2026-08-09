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
    const adapter = new StandaloneObservationAdapter({
      tracks: [source, target],
    });

    adapter.setObserved(target, source, () => ({ value: 7 }), {
      role: "input",
      target: "target",
    });
    adapter.setObserved(target, source, () => ({ extra: true }), {
      role: "output",
    });

    expect(adapter.state.getEdges("target")).toHaveLength(2);
    adapter.destroy();
  });

  it("is explicit about lifecycle and does not expose mutable ownership maps", () => {
    const adapter = new StandaloneObservationAdapter({
      tracks: [track("one")],
    });
    expect(adapter.tracks).toBeInstanceOf(Map);
    adapter.destroy();
    expect(() => adapter.compose(track("one"))).toThrow(/destroyed/i);
    expect(() => adapter.register(track("two"))).toThrow(/destroyed/i);
  });

  it("releases the shared owner entry when the last holder unregisters", () => {
    const source = track("source", { leaf: "s" });
    const observer = track("observer", { leaf: "o" });
    const adapter = new StandaloneObservationAdapter({
      tracks: [source, observer],
    });

    // Every edge mutation re-registers both endpoints. Counting those calls as
    // holds made the refcount unreachable from zero, so unregister() dropped the
    // outgoing edges but left the observer in the source's observer set.
    adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
    adapter.setObserved(observer, source, (patch) => ({ again: patch.leaf }));
    adapter.compose(observer);
    expect(adapter.getObserverIds(source)).toEqual(["observer"]);

    adapter.unregister(observer);
    expect(adapter.getObserverIds(source)).toEqual([]);
    expect(adapter.getEdges(observer)).toEqual([]);
    expect(adapter.tracks.size).toBe(1);
    adapter.destroy();
  });

  it("keeps a shared identity alive while another adapter still holds it", () => {
    const shared = track("shared", { leaf: "sh" });
    const observer = track("observer", { leaf: "o" });
    const holder = new StandaloneObservationAdapter({ tracks: [shared] });
    const adapter = new StandaloneObservationAdapter({
      tracks: [shared, observer],
    });
    const key = holder.keyFor(shared);

    adapter.setObserved(observer, shared, (patch) => ({ from: patch.leaf }));
    adapter.destroy();

    // The edge goes with the adapter that owned it, but the identity survives:
    // two adapters sharing one edge space is the only reason the globals exist.
    expect(holder.getObserverIds(shared)).toEqual([]);
    expect(holder.keyFor(shared)).toBe(key);
    expect(holder.tracks.size).toBe(1);
    holder.destroy();
  });
});
