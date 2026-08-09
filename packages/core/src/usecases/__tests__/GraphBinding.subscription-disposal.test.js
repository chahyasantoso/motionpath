import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { normalizeObservationGraph } from "../normalizeObservationGraph.js";

/**
 * Finding F-05. `#subscribeTrack` registered the lifecycle unsubscriber twice
 * and never registered the source-destroyed one, so disposal released only half
 * of what it had subscribed.
 */
function countingTrack(id) {
  const counts = { lifecycle: 0, sourceDestroyed: 0 };
  return {
    id,
    counts,
    isDestroyed: false,
    observedEdges: [],
    getSnapshot: () => ({}),
    compose: () => ({}),
    composeLocal: () => ({}),
    onLifecycle() {
      counts.lifecycle += 1;
      return () => {
        counts.lifecycle -= 1;
      };
    },
    onSourceDestroyed() {
      counts.sourceDestroyed += 1;
      return () => {
        counts.sourceDestroyed -= 1;
      };
    },
    _setGraphGuard() {},
    _setObservationComposer() {},
  };
}

function fakePublisher() {
  return { applyGraph() {}, destroy() {} };
}

describe("P2-03 GraphBinding subscription disposal", () => {
  it("releases every subscription it took, exactly once", () => {
    const track = countingTrack("a");
    const graph = normalizeObservationGraph({ tracks: [{ id: "a", observes: [] }] });
    const binding = new GraphBinding({
      graph,
      tracks: new Map([["a", track]]),
      publisher: fakePublisher(),
    });

    expect(track.counts.lifecycle).toBe(1);
    expect(track.counts.sourceDestroyed).toBe(1);

    binding.destroy();

    // Before the fix: lifecycle went to -1 (released twice) and
    // sourceDestroyed stayed at 1 (never released).
    expect(track.counts.lifecycle).toBe(0);
    expect(track.counts.sourceDestroyed).toBe(0);
  });

  it("releases subscriptions for tracks added after construction", () => {
    const first = countingTrack("a");
    const second = countingTrack("b");
    const graph = normalizeObservationGraph({ tracks: [{ id: "a", observes: [] }] });
    const binding = new GraphBinding({
      graph,
      tracks: new Map([["a", first]]),
      publisher: fakePublisher(),
    });

    binding.addTrack(second);
    expect(second.counts.sourceDestroyed).toBe(1);

    binding.destroy();
    expect(second.counts.lifecycle).toBe(0);
    expect(second.counts.sourceDestroyed).toBe(0);
  });
});
