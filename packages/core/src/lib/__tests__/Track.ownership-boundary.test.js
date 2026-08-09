import { describe, expect, it } from "vitest";
import { Track } from "../Track.js";

function authoredTrack() {
  return new Track({
    id: "authored",
    mode: "authored-graph",
    proxyState: {},
    plugins: [],
    resolvedTrack: { id: "authored", keyframes: {} },
  });
}

describe("P2-03 Track observation ownership boundary", () => {
  it("keeps authored Tracks free of the legacy observation surface", () => {
    const track = authoredTrack();
    for (const symbol of [
      "setObserved",
      "removeObserved",
      "replaceObserved",
      "observedSources",
      "observedEdges",
      "observerCount",
      "observerIds",
    ]) {
      expect(symbol in track, `${symbol} leaked onto an authored Track`).toBe(
        false,
      );
    }
    expect(track.getObservationOwner()).toBeNull();
    track.destroy();
  });

  it("keeps topology and playback outside this P2-03 boundary", () => {
    const source = Track.toString();
    for (const symbol of [
      "addChild",
      "removeChild",
      "_attachGroupHost",
      "play",
      "pause",
      "seek",
      "reverse",
    ]) {
      expect(source).toContain(symbol);
    }
  });
});
