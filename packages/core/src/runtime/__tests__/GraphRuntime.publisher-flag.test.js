import { describe, expect, it, vi } from "vitest";
import { GraphRuntime } from "../GraphRuntime.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

describe("GraphRuntime publisher flag", () => {
  it("keeps the publisher path opt-in and exposes patch subscriptions", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const legacy = new GraphRuntime({ graph, tracks, enabled: false });
    expect(legacy.usePublisher).toBe(false);
    expect(() => legacy.subscribe("n0", vi.fn())).not.toThrow();
    legacy.publisher.markDirty("n0");
    expect(legacy.flush()).toBe(0);
    expect(legacy.getPatch("n0")).toBeNull();
  });

  it("publishes immutable values through the enabled subscription path", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const runtime = new GraphRuntime({ graph, tracks, enabled: true });
    const seen = [];
    runtime.subscribe("n0", (patch) => seen.push(patch));
    runtime.publisher.markDirty("n0");
    expect(runtime.flush()).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe("ready");
    expect(Object.isFrozen(seen[0].values)).toBe(true);
  });

  it("preserves the one-argument compose callback contract", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const runtime = new GraphRuntime({ graph, tracks });
    const raw = { progress: 0.25 };
    expect(runtime.compose("n0", raw)).toEqual(tracks.get("n0").compose(raw));
  });

  it("does not publish after disposal and cleans subscriptions with the runtime", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const runtime = new GraphRuntime({ graph, tracks });
    const seen = vi.fn();
    runtime.subscribe("n0", seen);
    runtime.dispose();
    expect(() => runtime.flush()).not.toThrow();
    expect(() => runtime.subscribe("n0", seen)).toThrow(/disposed/i);
  });
});
