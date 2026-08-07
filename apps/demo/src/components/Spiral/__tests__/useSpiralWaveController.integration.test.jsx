// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "@motionpath/core/engines/Engine.js";
import { CompositeRuntime } from "@motionpath/core/runtime/CompositeRuntime.js";
import { compareShadowPatches } from "@motionpath/core/runtime/FixtureShadow.js";
import { gsapTickerClock } from "@motionpath/core/lib/gsapTickerClock.js";
import { createSpiralProject } from "../spiralMotions.js";
import { useSpiralWaveController } from "../useSpiralWaveController.js";

vi.mock("@motionpath/core/lib/gsapTickerClock.js", async () => {
  const { FakeClock } = await import("@motionpath/core/runtime/FakeClock.js");
  return { gsapTickerClock: new FakeClock() };
});

const project = createSpiralProject({
  spiralPathPoints: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  ballTravelSeconds: 1,
  ballSize: 12,
});

describe("useSpiralWaveController integration", () => {
  beforeEach(async () => {
    engine.destroy();
    await engine.loadProject(project);
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  it("drives the live controller through spawn, shadow comparison, and cleanup", async () => {
    const createHost = vi.spyOn(engine, "createGroupHost");
    const { result, unmount } = renderHook(() =>
      useSpiralWaveController({ isLoaded: true }),
    );

    await waitFor(() => expect(createHost).toHaveBeenCalledOnce());
    act(() => gsapTickerClock.tick(1 / 60));
    await waitFor(() => expect(result.current.ballVms).toHaveLength(1));

    const host = createHost.mock.results[0].value;
    const ball = result.current.ballVms[0];
    const shadow = new CompositeRuntime(host);
    shadow.register(ball.ballTrack);
    shadow.runtime.publisher.markAllDirty();
    shadow.flush();

    expect(compareShadowPatches(shadow.shadow().legacy, shadow.shadow().published)).toEqual({
      equal: true,
      mismatches: [],
    });
    expect(host.getChild(ball.ballTrack.id)).toBe(ball.ballTrack);

    shadow.dispose();
    unmount();
    expect(engine.instanceCount).toBe(0);
  });
});
