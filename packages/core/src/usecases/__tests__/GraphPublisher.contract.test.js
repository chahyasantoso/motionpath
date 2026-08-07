/**
 * PHASE 0 — RED BY DESIGN.
 *
 * These tests encode the TARGET GraphPublisher contract from
 * docs/V4.3-GRAPH-CORRECTNESS-PLAN.md, not the current one. They are expected
 * to fail until phases 1-3 land. Do not "fix" them by weakening the assertions.
 * The existing GraphPublisher.test.js passes only because it hands the
 * publisher object literals with a `compose(_raw, composed)` signature that no
 * real Track implements. Everything here uses real Tracks.
 */
import { describe, expect, it, vi } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import { Motion } from "../../lib/Motion.js";
import { ManualTriggerDelegate } from "../../lib/TriggerDelegate.js";
import { buildRealGraph, chainMotion, diamondMotion, makeTrack } from "../../__fixtures__/graphTracks.js";

describe("GraphPublisher — dependent publishing (D1)", () => {
  it("publishes the marked node AND its full downstream closure, in topological order", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); publisher.markDirty("a"); publisher.flush(); expect(published).toEqual(["a", "b", "c", "d"]); });
  it("does not publish upstream nodes when only a sink is marked", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); publisher.markDirty("d"); publisher.flush(); expect(published).toEqual(["d"]); });
  it("propagates through a long chain without needing per-node markDirty calls", () => { const { graph, tracks } = buildRealGraph(chainMotion(12)); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); publisher.markDirty("n5"); publisher.flush(); expect(published).toEqual(["n5", "n6", "n7", "n8", "n9", "n10", "n11"]); });
});

describe("GraphPublisher — unknown ids (D10)", () => {
  it("throws on an unknown id in strict mode instead of silently doing nothing", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const publisher = new GraphPublisher({ graph, tracks, publish: () => {} }); expect(() => publisher.markDirty("nope")).toThrow(/unknown track/i); });
  it("no-ops on an unknown id when strict is disabled", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const publisher = new GraphPublisher({ graph, tracks, publish: () => {}, strict: false }); expect(() => publisher.markDirty("nope")).not.toThrow(); expect(publisher.flush()).toBe(0); });
});

describe("GraphPublisher — failure isolation (D3)", () => {
  it("keeps publishing after one node throws, then retries it on the next flush", () => { const { graph, tracks } = buildRealGraph(chainMotion(6)); const published = []; let shouldFail = true; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => { if (id === "n2" && shouldFail) { shouldFail = false; throw new Error("renderer blew up"); } published.push(id); } }); publisher.markDirty("n0"); expect(() => publisher.flush()).toThrow(AggregateError); expect(published).toEqual(["n0", "n1", "n3", "n4", "n5"]); published.length = 0; publisher.flush(); expect(published).toEqual(["n2"]); });
  it("surfaces the original error inside the AggregateError", () => { const { graph, tracks } = buildRealGraph(chainMotion(3)); const publisher = new GraphPublisher({ graph, tracks, publish: (id) => { if (id === "n1") throw new Error("renderer blew up"); } }); publisher.markDirty("n0"); try { publisher.flush(); expect.unreachable("flush should have thrown"); } catch (error) { expect(error).toBeInstanceOf(AggregateError); expect(error.errors).toHaveLength(1); expect(error.errors[0].message).toMatch(/renderer blew up/); } });
});

describe("GraphPublisher — mutable topology (D5)", () => {
  it("composes and publishes a track registered after construction", () => { const { graph, tracks } = buildRealGraph(chainMotion(3)); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); const late = makeTrack("late"); publisher.addTrack("late", late); publisher.addEdge({ source: "n2", target: "late", role: "output" }); publisher.markDirty("n0"); publisher.flush(); expect(published).toEqual(["n0", "n1", "n2", "late"]); });
  it("stops composing a removed track and keeps the order topologically valid", () => { const { graph, tracks } = buildRealGraph(chainMotion(4)); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); publisher.removeTrack("n2"); publisher.markDirty("n0"); publisher.flush(); expect(published).not.toContain("n2"); expect(published.indexOf("n0")).toBeLessThan(published.indexOf("n1")); });
  it("accepts a wholesale graph swap via applyGraph", () => { const { graph, tracks } = buildRealGraph(chainMotion(3)); const published = []; const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) }); const rebuilt = buildRealGraph(diamondMotion()); publisher.applyGraph(rebuilt.graph, rebuilt.tracks); publisher.markDirty("a"); publisher.flush(); expect(published).toEqual(["a", "b", "c", "d"]); });
});

describe("GraphPublisher — global id uniqueness (D13)", () => {
  it("rejects a duplicate track id instead of silently shadowing", () => { const { graph, tracks } = buildRealGraph(chainMotion(3)); const publisher = new GraphPublisher({ graph, tracks, publish: () => {} }); expect(() => publisher.addTrack("n1", makeTrack("n1"))).toThrow(/duplicate track id/i); });
});

describe("GraphPublisher — single compose-context key space (D2)", () => {
  it("composes a diamond's shared ancestor exactly once per flush", () => { const { graph, tracks, composeCounts } = buildRealGraph(diamondMotion()); const publisher = new GraphPublisher({ graph, tracks, publish: () => {} }); publisher.markDirty("a"); publisher.flush(); expect(composeCounts.get("a")).toBe(1); expect(composeCounts.get("d")).toBe(1); });
  it("Motion.composeGraph returns exactly one entry per track, keyed by id", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const motion = new Motion({ id: "graph-motion", triggerDelegate: new ManualTriggerDelegate(), graphOrder: graph.order }); motion.init(); for (const track of tracks.values()) motion.mount(track, 0); const patches = motion.composeGraph(); expect(patches.size).toBe(4); expect([...patches.keys()].sort()).toEqual(["a", "b", "c", "d"]); for (const key of patches.keys()) expect(typeof key).toBe("string"); motion.destroy(); });
});

describe("GraphPublisher — locked behavior that must not regress", () => {
  it("leaves Track per-call compose scoping intact (compose-per-call-scoping-brief)", () => { const { tracks, composeCounts } = buildRealGraph(diamondMotion()); tracks.get("d").compose(); expect(composeCounts.get("a")).toBe(1); tracks.get("d").compose(); expect(composeCounts.get("a")).toBe(2); });
  it("still coalesces repeat markDirty calls into a single publish", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const publish = vi.fn(); const publisher = new GraphPublisher({ graph, tracks, publish }); publisher.markDirty("d"); publisher.markDirty("d"); publisher.markDirty("d"); expect(publisher.flush()).toBe(1); expect(publish).toHaveBeenCalledTimes(1); });
  it("returns 0 and publishes nothing on an idle flush", () => { const { graph, tracks } = buildRealGraph(diamondMotion()); const publish = vi.fn(); const publisher = new GraphPublisher({ graph, tracks, publish }); publisher.markDirty("a"); publisher.flush(); publish.mockClear(); expect(publisher.flush()).toBe(0); expect(publish).not.toHaveBeenCalled(); });
});
