import { describe, expect, it } from "vitest";
import { StandaloneObservationAdapter } from "../StandaloneObservationAdapter.js";
import { Track } from "../../lib/Track.js";

function track(id) {
  return new Track({ id, proxyState: { value: id }, plugins: [{ keys: ["value"], compose: (raw) => ({ value: raw.value }) }], resolvedTrack: { id, keyframes: {} } });
}

describe("P2-03 standalone external ownership", () => {
  it("adopts independently constructed endpoints on first edge mutation", () => {
    const source = track("source");
    const observer = track("observer");
    observer.setObserved(source, (patch) => ({ fromSource: patch.value }));
    expect(observer.compose()).toEqual({ value: "observer", fromSource: "source" });
    source.destroy();
    expect(observer.observedSources).toEqual([]);
    observer.destroy();
  });

  it("keeps authored graph Tracks unbound to standalone ownership", () => {
    const trackInstance = new Track({ id: "authored", mode: "authored-graph", proxyState: {}, plugins: [], resolvedTrack: { id: "authored", keyframes: {} } });
    expect(trackInstance.observedSources).toEqual([]);
    trackInstance.destroy();
  });
});
