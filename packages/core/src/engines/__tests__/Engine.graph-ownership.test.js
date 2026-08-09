/**
 * PR-02, lifecycle ownership repair.
 *
 * Engine.#mountMotion built a GraphBinding and a GraphPublisher per Motion and
 * then dropped both references. Nothing owned them, so nothing could dispose
 * them: destroying a Motion left a live publisher and live cycle guards behind,
 * and a mount that failed after publisher construction leaked the lot.
 *
 * These tests pin the ownership chain Motion -> GraphBinding -> GraphPublisher
 * through the public Engine surface only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";

const project = {
  schemaVersion: 4,
  projectId: "lifecycle-ownership",
  motions: [
    {
      id: "arm",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "parent",
          keyframes: {
            x: {
              stops: [
                { p: 0, v: 10 },
                { p: 1, v: 30 },
              ],
            },
            y: {
              stops: [
                { p: 0, v: 5 },
                { p: 1, v: 15 },
              ],
            },
            rotation: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 90 },
              ],
            },
          },
        },
        {
          id: "child",
          observes: [
            { source: "parent", role: "input", target: "parentWorld" },
          ],
          keyframes: {
            boneLength: {
              stops: [
                { p: 0, v: 10 },
                { p: 1, v: 20 },
              ],
            },
          },
        },
      ],
    },
  ],
};

function throwingDelegate() {
  return {
    destroyed: false,
    build() {
      throw new Error("delegate build failed");
    },
    play() {},
    pause() {},
    seek() {},
    reverse() {},
    onComplete() {},
    destroy() {
      this.destroyed = true;
    },
  };
}

describe("Engine graph ownership", () => {
  let engine;
  afterEach(() => {
    engine?.destroy();
    engine = undefined;
  });

  it("attaches the graph binding to the motion that owns it", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");

    const binding = motion.graphBinding;
    expect(binding).toBeTruthy();
    expect(binding.isDestroyed).toBe(false);
    expect(binding.tracks.size).toBe(2);
    expect(binding.graph.edges).toHaveLength(1);
  });

  it("keeps the live cycle guard installed on a mounted motion", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const parent = motion.getTrack("parent");
    const child = motion.getTrack("child");

    expect(() =>
      parent.setObserved(child, (patch) => patch, { role: "output" }),
    ).toThrow(/cycle/i);
  });

  it("disposes the binding and its publisher when the motion is destroyed", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const binding = motion.graphBinding;

    motion.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(binding.tracks.size).toBe(0);
    expect(motion.graphBinding).toBe(null);
  });

  it("makes repeated destroy safe", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const binding = motion.graphBinding;

    expect(() => {
      motion.destroy();
      motion.destroy();
    }).not.toThrow();
    expect(() => binding.destroy()).not.toThrow();
    expect(motion.graphBinding).toBe(null);
  });

  it("disposes the binding when the engine unmounts the motion", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const binding = motion.graphBinding;

    expect(engine.unmount(motion)).toBe(true);
    expect(binding.isDestroyed).toBe(true);
    expect(engine.instanceCount).toBe(0);
  });

  it("releases the previous binding when the project reloads", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const binding = motion.graphBinding;

    await engine.loadProject(project);

    expect(binding.isDestroyed).toBe(true);
    expect(engine.instanceCount).toBe(0);

    const remounted = engine.mountInstance("arm");
    expect(remounted.graphBinding).toBeTruthy();
    expect(remounted.graphBinding).not.toBe(binding);
    expect(remounted.graphBinding.isDestroyed).toBe(false);
  });

  it("cleans up the graph when a mount fails after the publisher is built", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const delegate = throwingDelegate();

    expect(() => engine.mountWithDelegate("arm", delegate)).toThrow(
      "delegate build failed",
    );

    expect(delegate.destroyed).toBe(true);
    expect(engine.instanceCount).toBe(0);
    expect(engine.getTrack("parent")).toBe(null);
  });

  it("does not resurrect a graph binding on a destroyed motion", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const first = engine.mountInstance("arm");
    const second = engine.mountInstance("arm");
    const orphan = second.graphBinding;

    first.destroy();
    first.setGraphBinding(orphan);

    expect(first.graphBinding).toBe(null);
    expect(orphan.isDestroyed).toBe(true);
  });
});
