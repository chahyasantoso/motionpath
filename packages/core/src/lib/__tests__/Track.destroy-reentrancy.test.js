import { describe, expect, it } from "vitest";
import { Track } from "../Track.js";
import { installLegacyObservationFacade } from "../../usecases/LegacyObservationFacade.js";

function fakeTimeline(counters) {
  return { progress: () => 0, duration: () => 0, kill: () => { counters.kills += 1; } };
}

function makeTrack(counters, id = "reentrant") {
  return installLegacyObservationFacade(new Track({ id, proxyState: { value: id }, plugins: [{ keys: ["value"], compose: (raw) => ({ value: raw.value }) }], resolvedTrack: { id, keyframes: {} }, interpolationTimeline: fakeTimeline(counters) }));
}

describe("P2-03 Track.destroy re-entrancy", () => {
  it("ignores a destroy() triggered from inside its own destroy notification", () => {
    const counters = { kills: 0 };
    const track = makeTrack(counters);
    const destroyedEvents = [];
    track.onLifecycle((event) => { if (event.type === "destroyed") destroyedEvents.push(event); });
    track.onSourceDestroyed(() => { expect(track.isDestroyed).toBe(false); track.destroy(); });
    track.destroy();
    expect(destroyedEvents).toHaveLength(1);
    expect(counters.kills).toBe(1);
    expect(track.isDestroyed).toBe(true);
  });

  it("still reports observer ids to destroy subscribers before cleanup", () => {
    const counters = { kills: 0 };
    const source = makeTrack(counters, "source");
    const observer = makeTrack(counters, "observer");
    observer.setObserved(source, (patch) => ({ fromSource: patch.value }));
    const reported = [];
    source.onSourceDestroyed((event) => reported.push([...event.observerIds]));
    source.destroy();
    expect(reported).toEqual([["observer"]]);
    observer.destroy();
  });

  it("remains idempotent when destroy is called again later", () => {
    const counters = { kills: 0 };
    const track = makeTrack(counters);
    track.destroy();
    track.destroy();
    expect(counters.kills).toBe(1);
  });
});
