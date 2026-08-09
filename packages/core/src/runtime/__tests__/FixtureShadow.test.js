import { describe, expect, it } from "vitest";
import { GraphRuntime } from "../GraphRuntime.js";
import {
  composeLegacyPatches,
  compareShadowPatches,
  shadowFixture,
} from "../FixtureShadow.js";
import {
  buildRealGraph,
  chainMotion,
  diamondMotion,
  independentChainsMotion,
} from "../../__fixtures__/graphTracks.js";

function makeRuntime(motion) {
  const built = buildRealGraph(motion);
  return {
    ...built,
    runtime: new GraphRuntime({ graph: built.graph, tracks: built.tracks }),
  };
}

describe("fixture shadow mode", () => {
  it("matches the legacy composer for fan-in and fan-out", () => {
    const built = makeRuntime(diamondMotion());
    built.tracks.get("a").progress(0.25);
    built.tracks.get("b").progress(0.5);
    const result = shadowFixture({ ...built, marks: ["a"] });
    expect(result.comparison).toEqual({ equal: true, mismatches: [] });
    expect([...result.published.keys()]).toEqual(["a", "b", "c", "d"]);
  });

  it("matches multi-level chain output within the numeric tolerance", () => {
    const built = makeRuntime(chainMotion(12));
    built.tracks.get("n0").progress(0.375);
    const result = shadowFixture({ ...built, marks: ["n0"] });
    expect(result.comparison.equal).toBe(true);
    expect(result.comparison.mismatches).toEqual([]);
  });

  it("keeps disconnected failure-isolated branches structurally equivalent", () => {
    const built = makeRuntime(independentChainsMotion());
    const legacy = composeLegacyPatches(built.graph, built.tracks);
    built.runtime.publisher.markAllDirty();
    built.runtime.flush();
    const published = new Map(
      [...built.runtime.patches.snapshot()].map(([id, patch]) => [
        id,
        patch.values,
      ]),
    );
    expect(compareShadowPatches(legacy, published)).toEqual({
      equal: true,
      mismatches: [],
    });
  });

  it("does not hide structure or status mismatches behind numeric tolerance", () => {
    const legacy = new Map([["n0", { x: 1, role: "ready" }]]);
    const published = new Map([["n0", { x: 1.000000001, role: "error" }]]);
    const result = compareShadowPatches(legacy, published, { tolerance: 1e-6 });
    expect(result.equal).toBe(false);
    expect(result.mismatches).toContain("n0.role: error !== ready");
  });

  it("reports invalidation timing as the published closure, not the whole graph", () => {
    const built = makeRuntime(diamondMotion());
    built.runtime.publisher.markDirty("d");
    built.runtime.flush();
    expect([...built.runtime.patches.snapshot().keys()]).toEqual(["d"]);
    built.runtime.publisher.markDirty("a");
    built.runtime.flush();
    expect([...built.runtime.patches.snapshot().keys()]).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });
});
