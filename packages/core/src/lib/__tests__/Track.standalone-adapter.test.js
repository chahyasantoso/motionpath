import { describe, expect, it } from "vitest";
import { StandaloneObservationAdapter } from "../../usecases/StandaloneObservationAdapter.js";
import { installLegacyObservationFacade } from "../../usecases/LegacyObservationFacade.js";
import { Track } from "../Track.js";

function makeTrack(id, adapter) {
  return installLegacyObservationFacade(
    new Track({
      id,
      observationAdapter: adapter,
      proxyState: { value: id },
      plugins: [{ keys: ["value"], compose: (raw) => ({ value: raw.value }) }],
      resolvedTrack: { id, keyframes: {} },
    }),
  );
}

describe("P2-03 Track standalone adapter routing", () => {
  it("routes Track observation and composition through one explicit adapter", () => {
    const adapter = new StandaloneObservationAdapter();
    const a = makeTrack("a", adapter);
    const b = makeTrack("b", adapter);
    a.setObserved(b, (patch) => ({ fromB: patch.value }));
    b.setObserved(a, (patch) => ({ fromA: patch.value }));
    expect(a.compose()).toEqual({ value: "a", fromB: "b" });
    expect(b.compose()).toEqual({ value: "b", fromA: "a" });
    expect(a.observedSources).toEqual([b]);
    adapter.destroy();
  });

  it("isolates duplicate local ids by Track identity", () => {
    const adapter = new StandaloneObservationAdapter();
    const left = makeTrack("bone", adapter);
    const right = makeTrack("bone", adapter);
    left.setObserved(right, (patch) => ({ fromRight: patch.value }));
    expect(left.compose()).toEqual({ value: "bone", fromRight: "bone" });
    expect(left.observedSources).toEqual([right]);
    expect(right.observerIds).toEqual([left.id]);
    left.destroy();
    right.destroy();
    adapter.destroy();
  });

  it("keeps adapter-backed observer cleanup idempotent", () => {
    const adapter = new StandaloneObservationAdapter();
    const source = makeTrack("source", adapter);
    const observer = makeTrack("observer", adapter);
    observer.setObserved(source, (patch) => ({ fromSource: patch.value }));
    source.destroy();
    expect(observer.observedSources).toEqual([]);
    observer.destroy();
    expect(() => observer.destroy()).not.toThrow();
    adapter.destroy();
  });
});
