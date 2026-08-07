// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "@motionpath/core/engines/Engine.js";
import { CompositeRuntime } from "@motionpath/core/runtime/CompositeRuntime.js";
import { compareShadowPatches } from "@motionpath/core/runtime/FixtureShadow.js";
import { gsapTickerClock } from "@motionpath/core/lib/gsapTickerClock.js";
import { createSpiralProject } from "../spiralMotions.js";
import { useSpiralWaveController } from "../useSpiralWaveController.js";

const { clock } = vi.hoisted(() => {
  const listeners = new Set();
  return {
    clock: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      tick(delta = 1 / 60) {
        for (const listener of [...listeners]) listener(delta);
      },
      reset() {
        listeners.clear();
      },
    },
  };
});

vi.mock("@motionpath/core/lib/gsapTickerClock.js", () => ({
  gsapTickerClock: clock,
}));

const project = createSpiralProject({
  spiralPathPoints: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  ballTravelSeconds: 1,
  ballSize: 12,
});

async function withCiAnnotation(run) {
  try {
    await run();
  } catch (error) {
    const message = String(error?.stack ?? error)
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.error(`::error title=Spiral controller integration::${message}`);
    throw error;
  }
}

describe("useSpiralWaveController integration", () => {
  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    engine.destroy();
    clock.reset();
    await engine.loadProject(project);
  });

  afterEach(() => {
    engine.destroy();
    clock.reset();
    vi.restoreAllMocks();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it("drives the live controller through spawn, shadow comparison, and cleanup", () =>
    withCiAnnotation(async () => {
      const createHost = vi.spyOn(engine, "createGroupHost");
      const realGsapTo = gsap.to.bind(gsap);
      vi.spyOn(gsap, "to").mockImplementation((target, vars) => {
        if (typeof target?.progress !== "function" || vars?.progress === undefined) {
          return realGsapTo(target, vars);
        }
        queueMicrotask(() => {
          target.progress(vars.progress);
          vars.onComplete?.();
        });
        return { kill: vi.fn() };
      });
      let controller;
      function Harness() {
        controller = useSpiralWaveController({ isLoaded: true });
        return null;
      }

      const root = createRoot(document.createElement("div"));
      await act(async () => root.render(<Harness />));
      expect(createHost).toHaveBeenCalledOnce();

      await act(async () => {
        gsapTickerClock.tick();
        await Promise.resolve();
      });
      expect(controller.ballVms).toHaveLength(1);
      expect(controller.ballVms[0].status).toBe("active");

      const host = createHost.mock.results[0].value;
      const ball = controller.ballVms[0];
      const shadow = new CompositeRuntime(host);
      shadow.register(ball.ballTrack);
      shadow.runtime.publisher.markAllDirty();
      shadow.flush();
      const comparison = shadow.shadow();

      expect(
        compareShadowPatches(comparison.legacy, comparison.published),
      ).toEqual({ equal: true, mismatches: [] });
      expect(host.getChild(ball.ballTrack.id)).toBe(ball.ballTrack);

      shadow.dispose();
      await act(async () => root.unmount());
      expect(engine.instanceCount).toBe(0);
    }));
});
