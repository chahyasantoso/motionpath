import { describe, expect, it } from "vitest";
import { createTrack } from "../createTrack.js";
import { StandaloneObservationAdapter } from "../../usecases/StandaloneObservationAdapter.js";

describe("P2-03 createTrack standalone ownership", () => {
  it("constructs standalone tracks with an explicit adapter by default", () => {
    const adapter = new StandaloneObservationAdapter();
    const source = createTrack(
      { id: "source", duration: 1, keyframes: {} },
      [],
      { observationAdapter: adapter },
    );
    const observer = createTrack(
      { id: "observer", duration: 1, keyframes: {} },
      [],
      { observationAdapter: adapter },
    );

    observer.setObserved(source, () => ({ sourceSeen: true }));

    expect(observer.observedSources).toEqual([source]);
    expect(observer.compose()).toMatchObject({ sourceSeen: true });
    observer.destroy();
    source.destroy();
    adapter.destroy();
  });

  it("does not attach authored-graph tracks to standalone ownership", () => {
    const track = createTrack({
      id: "authored",
      mode: "authored-graph",
      duration: 1,
      keyframes: {},
    });
    expect(track.observedSources).toEqual([]);
    track.destroy();
  });
});
