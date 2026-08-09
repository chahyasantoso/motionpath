/**
 * PR-19b evidence for the two PR-16 CI requirements that had no committed
 * suite: compose-once-per-node-per-tick, and subscriber scaling.
 *
 * These use `buildRealGraph`, so the compose counter is bumped inside a real
 * plugin's compose, not by spying on Track.compose. That distinction is the
 * whole point: the original publisher unit tests substituted object literals
 * for tracks and shipped "Complete" while unable to publish a node's
 * dependents at all.
 */
import { describe, expect, it, vi } from "vitest";
import { GraphRuntime } from "../GraphRuntime.js";
import { createTickClock } from "../../ports/Clock.js";
import {
  buildRealGraph,
  chainMotion,
  diamondMotion,
} from "../../__fixtures__/graphTracks.js";

function testClock() {
  const listeners = new Set();
  let tick = 0;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick(delta = 16) {
      tick += 1;
      for (const listener of [...listeners]) listener({ tick, delta });
      return tick;
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const total = (counts) => [...counts.values()].reduce((sum, n) => sum + n, 0);

describe("publisher evidence: compose once per node per tick", () => {
  it("composes every node exactly once on a tick, however many edges it feeds", () => {
    const { graph, tracks, composeCounts } = buildRealGraph(diamondMotion());
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });

    clock.tick();

    // 'a' feeds both 'b' and 'c'. Composing it twice would be the naive result.
    expect(Object.fromEntries(composeCounts)).toEqual({
      a: 1,
      b: 1,
      c: 1,
      d: 1,
    });
    runtime.dispose();
  });

  it("does no work on a tick where nothing was invalidated", () => {
    const { graph, tracks, composeCounts } = buildRealGraph(chainMotion(4));
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });

    clock.tick();
    expect(total(composeCounts)).toBe(4);

    clock.tick();
    clock.tick();
    expect(total(composeCounts)).toBe(4);

    tracks.get("n0").progress(0.5);
    clock.tick();
    expect(Object.fromEntries(composeCounts)).toEqual({
      n0: 2,
      n1: 2,
      n2: 2,
      n3: 2,
    });
    runtime.dispose();
  });

  it("never flushes twice for one tick even under re-entrant invalidation", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });
    const flushes = [];
    runtime.subscribe("n1", () => {
      flushes.push(runtime.flush());
    });

    clock.tick();

    // The subscriber's re-entrant flush must be refused, not queued.
    expect(flushes).toEqual([0]);
    runtime.dispose();
  });
});

describe("publisher evidence: subscriber scaling", () => {
  it("holds composition cost flat as subscribers grow", () => {
    const measured = [];
    for (const subscriberCount of [1, 10, 50]) {
      const { graph, tracks, composeCounts } = buildRealGraph(chainMotion(4));
      const clock = testClock();
      const runtime = new GraphRuntime({ graph, tracks, clock });
      const notified = new Array(subscriberCount).fill(0);
      for (let i = 0; i < subscriberCount; i += 1)
        runtime.subscribe("n3", () => {
          notified[i] += 1;
        });

      tracks.get("n0").progress(0.5);
      clock.tick();

      measured.push({
        subscriberCount,
        composes: total(composeCounts),
        delivered: notified.filter((n) => n === 1).length,
      });
      runtime.dispose();
    }

    expect(measured.map(({ composes }) => composes)).toEqual([4, 4, 4]);
    expect(measured.map(({ delivered }) => delivered)).toEqual([1, 10, 50]);
  });

  it("hands every subscriber the identical frozen patch instance", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });
    const received = [];
    for (let i = 0; i < 5; i += 1)
      runtime.subscribe("n1", (patch) => received.push(patch));

    clock.tick();

    expect(received).toHaveLength(5);
    expect(new Set(received).size).toBe(1);
    expect(Object.isFrozen(received[0].values)).toBe(true);
    runtime.dispose();
  });

  it("records the per-subscriber cost this path replaces", () => {
    // The legacy React path calls track.compose() inside every subscriber, and
    // each call re-walks the node's whole upstream chain with a fresh context.
    const { tracks, composeCounts } = buildRealGraph(chainMotion(4));
    const leaf = tracks.get("n3");
    for (let i = 0; i < 10; i += 1) leaf.compose(leaf.getSnapshot());

    // 10 subscribers x 4 nodes in the chain.
    expect(total(composeCounts)).toBe(40);
  });
});

describe("publisher evidence: failure and lifecycle on a live clock", () => {
  it("isolates a compose failure and never throws into the ticker", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2), {
      onCompose: (id) => {
        if (id === "n1") throw new Error("plugin exploded");
      },
    });
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });

    expect(() => clock.tick()).not.toThrow();
    expect(() => clock.tick()).not.toThrow();

    expect(runtime.getPatch("n0")).not.toBeNull();
    expect(runtime.getPatch("n1")).toBeNull();
    expect(runtime.diagnostics[0]).toMatchObject({
      code: "GRAPH_FLUSH_FAILED",
    });
    runtime.dispose();
  });

  it("still throws from a direct flush, because the caller asked", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2), {
      onCompose: (id) => {
        if (id === "n1") throw new Error("plugin exploded");
      },
    });
    const runtime = new GraphRuntime({ graph, tracks });
    runtime.publisher.markAllDirty();

    expect(() => runtime.flush()).toThrow(/flush failed/i);
    runtime.dispose();
  });

  it("detaches from the clock on dispose", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const clock = testClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });
    expect(clock.listenerCount).toBe(1);

    runtime.dispose();

    expect(clock.listenerCount).toBe(0);
    expect(() => clock.tick()).not.toThrow();
  });
});

describe("createTickClock", () => {
  it("normalizes a delta-only source and shares one upstream subscription", () => {
    const subscribe = vi.fn();
    let emit;
    subscribe.mockImplementation((listener) => {
      emit = listener;
      return () => {
        emit = null;
      };
    });
    const clock = createTickClock({ subscribe });

    const seen = [];
    const offA = clock.subscribe((event) => seen.push(["a", event]));
    const offB = clock.subscribe((event) => seen.push(["b", event]));
    expect(subscribe).toHaveBeenCalledTimes(1);

    emit(16.7);
    expect(seen).toEqual([
      ["a", { tick: 1, delta: 16.7 }],
      ["b", { tick: 1, delta: 16.7 }],
    ]);

    offA();
    expect(clock.isAttached).toBe(true);
    offB();
    expect(clock.isAttached).toBe(false);

    // Monotonic across reattachment: tick numbers drive retry backoff.
    clock.subscribe(() => {});
    emit(8);
    expect(clock.tickNumber).toBe(2);
  });
});
