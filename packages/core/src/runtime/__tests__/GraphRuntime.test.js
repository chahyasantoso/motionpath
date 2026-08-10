import { describe, expect, it } from "vitest";
import { GraphRuntime } from "../GraphRuntime.js";
import { FakeClock } from "../FakeClock.js";
import { PatchRegistry } from "../PatchRegistry.js";
import {
  buildRealGraph,
  chainMotion,
  makeTrack,
} from "../../__fixtures__/graphTracks.js";

describe("GraphRuntime", () => {
  it("registers, flushes and publishes immutable patches", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const runtime = new GraphRuntime({ graph, tracks });
    runtime.publisher.markDirty("n0");
    expect(runtime.flush()).toBe(2);
    const patch = runtime.patches.get("n1");
    expect(patch).toMatchObject({ nodeId: "n1", revision: 1, status: "ready" });
    expect(Object.isFrozen(patch)).toBe(true);
    expect(Object.isFrozen(patch.values)).toBe(true);
  });

  it("flushes at most once per clock tick and remains old-path opt-in", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const clock = new FakeClock();
    const runtime = new GraphRuntime({ graph, tracks, clock, enabled: false });
    runtime.publisher.markDirty("n0");
    clock.tick();
    expect(runtime.patches.get("n0")).toBeNull();
    runtime.enabled = true;
    clock.tick();
    expect(runtime.patches.get("n0").revision).toBe(1);
  });

  it("registers a late track through the runtime boundary", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const runtime = new GraphRuntime({ graph, tracks });
    const late = makeTrack("late");
    runtime.register(late, [
      { source: "n0", mapFn: (patch) => ({ from_n0: patch.transform }) },
    ]);
    expect(runtime.graph.nodes.map(({ id }) => id)).toContain("late");
  });

  it("disposes clock, binding and publisher as one owner", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(1));
    const runtime = new GraphRuntime({ graph, tracks });
    const publisher = runtime.publisher;
    runtime.dispose();
    expect(runtime.isDisposed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(() => runtime.flush()).not.toThrow();
    expect(() => runtime.register(makeTrack("late"))).toThrow(/disposed/i);
  });

  it("supports patch subscribers and structured diagnostics storage", () => {
    const patches = new PatchRegistry();
    const seen = [];
    patches.subscribe("n0", (patch) => seen.push(patch));
    patches.publish("n0", { x: 1 }, { sourceProgress: 0.5 });
    expect(seen[0]).toMatchObject({ nodeId: "n0", sourceProgress: 0.5 });
    expect(patches.snapshot().get("n0").revision).toBe(1);
  });
});
