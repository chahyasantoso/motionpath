import { describe, expect, it } from "vitest";
import { FakeClock } from "../FakeClock.js";
import { GraphRuntime } from "../GraphRuntime.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

describe("P2-05 publisher rollout evidence", () => {
  it("publishes a complete initial snapshot on the first clock tick", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const clock = new FakeClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });
    clock.tick();
    expect(runtime.getPatch("n0")).not.toBeNull();
    expect(runtime.getPatch("n1")).not.toBeNull();
    expect(runtime.getPatch("n2")).not.toBeNull();
    runtime.dispose();
  });

  it("stops clock delivery and releases runtime state on dispose", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const clock = new FakeClock();
    const runtime = new GraphRuntime({ graph, tracks, clock });
    runtime.dispose();
    expect(() => clock.tick()).not.toThrow();
    expect(runtime.isDisposed).toBe(true);
    expect(runtime.isRunning).toBe(false);
  });
});
