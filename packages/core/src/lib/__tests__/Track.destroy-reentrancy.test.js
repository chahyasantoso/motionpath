import { describe, expect, it } from "vitest";
import { Track } from "../Track.js";

/**
 * Finding F-04. #139 moved the destroy-subscriber notification above the
 * `#destroyed` flag so listeners could still read observer state. GraphBinding
 * reacts to that notification by calling `track.destroy()` when the track does
 * not yet report itself destroyed, so `destroy()` re-entered itself.
 *
 * The observable symptoms of the re-entrant path were a duplicated "destroyed"
 * lifecycle event and a second `kill()` on the interpolation timeline.
 */
function fakeTimeline(counters) {
  return {
    progress: () => 0,
    duration: () => 0,
    kill: () => {
      counters.kills += 1;
    },
  };
}

function makeTrack(counters, id = "reentrant") {
  return new Track({
    id,
    proxyState: { value: id },
    plugins: [{ keys: ["value"], compose: (raw) => ({ value: raw.value }) }],
    resolvedTrack: { id, keyframes: {} },
    interpolationTimeline: fakeTimeline(counters),
  });
}

describe("P2-03 Track.destroy re-entrancy", () => {
  it("ignores a destroy() triggered from inside its own destroy notification", () => {
    const counters = { kills: 0 };
    const track = makeTrack(counters);
    const destroyedEvents = [];
    track.onLifecycle((event) => {
      if (event.type === "destroyed") destroyedEvents.push(event);
    });
    // This is what GraphBinding.removeTrack({ destroy: true }) effectively does.
    track.onSourceDestroyed(() => {
      expect(track.isDestroyed).toBe(false);
      track.destroy();
    });

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
