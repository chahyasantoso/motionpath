/**
 * PR-02, lifecycle ownership repair.
 *
 * #mountMotion built a GraphPublisher and a GraphBinding and then dropped both
 * on the floor. Nothing referenced them, so nothing could dispose them and no
 * runtime mutation could ever reach the graph. The Motion now owns its graph
 * layer, which is what makes destroy, unmount, reload and failed mount able to
 * tear it down.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Engine } from "../Engine.js";
import { GraphBinding } from "../../usecases/GraphBinding.js";
import { GraphPublisher } from "../../usecases/GraphPublisher.js";

const project = {
  schemaVersion: 4,
  projectId: "graph-ownership",
  motions: [
    {
      id: "arm",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "parent",
          keyframes: {
            x: { stops: [{ p: 0, v: 10 }, { p: 1, v: 30 }] },
            y: { stops: [{ p: 0, v: 5 }, { p: 1, v: 15 }] },
            rotation: { stops: [{ p: 0, v: 0 }, { p: 1, v: 90 }] },
          },
        },
        {
          id: "child",
          observes: [{ source: "parent", role: "input", target: "parentWorld" }],
          keyframes: { boneLength: { stops: [{ p: 0, v: 10 }, { p: 1, v: 20 }] } },
        },
      ],
    },
  ],
};

describe("Engine graph ownership", () => {
  let engine;
  afterEach(() => {
    engine?.destroy();
    engine = null;
    vi.restoreAllMocks();
  });

  async function mounted() {
    engine = new Engine();
    await engine.loadProject(project);
    return engine.mountInstance("arm");
  }

  it("attaches the graph layer to the motion that owns it", async () => {
    const motion = await mounted();

    expect(motion.graphBinding).toBeInstanceOf(GraphBinding);
    expect(motion.graphBinding.publisher).toBeInstanceOf(GraphPublisher);
    expect(motion.graphBinding.publisher.trackCount).toBe(2);
    const order = motion.graphBinding.graph.order;
    expect(order.indexOf("parent")).toBeLessThan(order.indexOf("child"));
  });

  it("keeps the live cycle guard installed on mounted tracks", async () => {
    const motion = await mounted();
    const parent = motion.getTrack("parent");
    const child = motion.getTrack("child");

    expect(() => parent.setObserved(child, (patch) => patch, { role: "output" })).toThrow(/cycle/i);
  });

  it("disposes the graph layer on destroy, repeatedly", async () => {
    const motion = await mounted();
    const binding = motion.graphBinding;
    const publisher = binding.publisher;
    const parent = motion.getTrack("parent");
    const child = motion.getTrack("child");

    motion.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(publisher.trackCount).toBe(0);
    expect(publisher.graphOrder).toEqual([]);
    expect(motion.graphBinding).toBeNull();
    expect(parent.isDestroyed).toBe(true);
    expect(child.isDestroyed).toBe(true);
    expect(parent.observerCount).toBe(0);
    expect(child.observedSources).toEqual([]);

    expect(() => motion.destroy()).not.toThrow();
    expect(() => motion.destroy()).not.toThrow();
  });

  it("disposes the graph layer on unmount", async () => {
    const motion = await mounted();
    const binding = motion.graphBinding;
    const publisher = binding.publisher;

    expect(engine.unmount(motion)).toBe(true);

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(engine.instanceCount).toBe(0);
    expect(engine.unmount(motion)).toBe(false);
  });

  it("disposes the previous graph layer on reload", async () => {
    const motion = await mounted();
    const binding = motion.graphBinding;
    const publisher = binding.publisher;

    await engine.loadProject(project);

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(engine.instanceCount).toBe(0);

    const remounted = engine.mountInstance("arm");
    expect(remounted.graphBinding).toBeInstanceOf(GraphBinding);
    expect(remounted.graphBinding.isDestroyed).toBe(false);
    expect(remounted.graphBinding.publisher.trackCount).toBe(2);
  });

  it("disposes the graph layer on engine destroy", async () => {
    const motion = await mounted();
    const binding = motion.graphBinding;
    const publisher = binding.publisher;

    engine.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
  });

  it("disposes the graph layer when the mount fails after it is built", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const bindingDestroy = vi.spyOn(GraphBinding.prototype, "destroy");
    const publisherDestroy = vi.spyOn(GraphPublisher.prototype, "destroy");
    const delegate = {
      build: () => { throw new Error("delegate build failed"); },
      play: () => {}, pause: () => {}, seek: () => {}, reverse: () => {}, onComplete: () => {}, destroy: () => {},
    };

    expect(() => engine.mountWithDelegate("arm", delegate)).toThrow("delegate build failed");

    expect(bindingDestroy).toHaveBeenCalledTimes(1);
    expect(publisherDestroy).toHaveBeenCalledTimes(1);
    expect(engine.instanceCount).toBe(0);
  });

  it("leaves nothing registered when track construction fails before the graph exists", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const publisherDestroy = vi.spyOn(GraphPublisher.prototype, "destroy");

    expect(() => engine.mountWithDelegate("missing-motion", {})).toThrow(/not found/i);

    expect(publisherDestroy).not.toHaveBeenCalled();
    expect(engine.instanceCount).toBe(0);
  });
});
