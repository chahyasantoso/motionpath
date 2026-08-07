import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../FakeClock.js";
import { PatchRegistry } from "../PatchRegistry.js";
import { GraphRuntime } from "../GraphRuntime.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

describe("PR-05 patch and clock contracts", () => {
  it("keeps revisions stable when effective output is unchanged", () => { const registry = new PatchRegistry(); const first = registry.publish("n0", { x: 1 }, { sourceProgress: 0.5 }); const second = registry.publish("n0", { x: 1 }, { sourceProgress: 0.5 }); expect(second).toBe(first); expect(second.revision).toBe(1); });
  it("increments revisions and notifies only on effective output change", () => { const registry = new PatchRegistry(); const seen = vi.fn(); registry.subscribe("n0", seen); registry.publish("n0", { x: 1 }); registry.publish("n0", { x: 2 }); expect(seen).toHaveBeenCalledTimes(2); expect(registry.get("n0").revision).toBe(2); });
  it("coalesces bursty invalidation to one flush per tick", () => { const { graph, tracks } = buildRealGraph(chainMotion(2)); const clock = new FakeClock(); const runtime = new GraphRuntime({ graph, tracks, clock }); const flush = vi.spyOn(runtime.publisher, "flush"); tracks.get("n0").progress(0.2); tracks.get("n0").progress(0.4); tracks.get("n0").progress(0.6); clock.tick(); expect(flush).toHaveBeenCalledTimes(1); });
  it("publishes source progress and source revisions for paused and seeking sources", () => { const { graph, tracks } = buildRealGraph(chainMotion(2)); const runtime = new GraphRuntime({ graph, tracks }); tracks.get("n0").progress(0.75); runtime.publisher.markDirty("n0"); runtime.flush(); const patch = runtime.patches.get("n0"); expect(patch.sourceProgress).toBeCloseTo(0.75); expect(patch.sourceRevisions.n0).toBe(1); });
  it("does not expose half-flushed state to subscribers", () => { const { graph, tracks } = buildRealGraph(chainMotion(3)); const runtime = new GraphRuntime({ graph, tracks }); const snapshots = []; runtime.patches.subscribe("*", (snapshot) => snapshots.push(snapshot)); runtime.publisher.markDirty("n0"); runtime.flush(); expect(snapshots).toHaveLength(1); expect([...snapshots[0].keys()]).toEqual(["n0", "n1", "n2"]); });
});
