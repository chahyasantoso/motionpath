/**
 * PR-19b, publisher sink.
 *
 * Engine.#mountMotion built its GraphPublisher with `publish: () => {}`. Every
 * mounted motion composed its graph and threw the result away, which meant the
 * PR-16 merge gate ("same-motion rendering is publisher-backed") was
 * unimplemented while Checkpoints E and F were certified on top of it.
 *
 * These tests pin the sink through the public Engine surface: the gate, the
 * ordering that makes a partial mount unflushable, and disposal.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";

const project = {
  schemaVersion: 4,
  projectId: "publisher-sink",
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

function testClock() {
  const listeners = new Set();
  let tick = 0;
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    tick(delta = 16) { tick += 1; for (const listener of [...listeners]) listener({ tick, delta }); return tick; },
    get listenerCount() { return listeners.size; },
  };
}

function throwingDelegate() {
  return {
    destroyed: false,
    build() { throw new Error("delegate build failed"); },
    play() {}, pause() {}, seek() {}, reverse() {}, onComplete() {},
    destroy() { this.destroyed = true; },
  };
}

describe("Engine publisher sink", () => {
  let engine;
  let clock;
  afterEach(() => { engine?.destroy(); engine = undefined; clock = undefined; });

  describe("the gate", () => {
    it("is off by default and leaves the legacy path untouched", async () => {
      clock = testClock();
      engine = new Engine({ clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");

      expect(engine.publisherRendering).toBe(false);
      expect(motion.graphRuntime).toBe(null);
      expect(motion.usePublisherRendering).toBe(false);
      expect(motion.graphBinding).toBeTruthy();
      expect(motion.getPatch("parent")).toBe(null);
      expect(clock.listenerCount).toBe(0);
    });

    it("only accepts the literal boolean true", () => {
      for (const value of ["true", 1, {}, undefined, null, "yes"]) {
        expect(new Engine({ publisherRendering: value }).publisherRendering).toBe(false);
      }
      expect(new Engine({ publisherRendering: true }).publisherRendering).toBe(true);
    });

    it("does not switch a motion that is already mounted", async () => {
      clock = testClock();
      engine = new Engine({ clock });
      await engine.loadProject(project);
      const legacy = engine.mountInstance("arm");

      engine.publisherRendering = true;
      const backed = engine.mountInstance("arm");

      expect(legacy.usePublisherRendering).toBe(false);
      expect(backed.usePublisherRendering).toBe(true);
    });
  });

  describe("delivery", () => {
    it("publishes composed patches to the registry on a tick", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");

      expect(clock.listenerCount).toBe(1);
      expect(motion.getPatch("parent")).toBe(null);

      clock.tick();

      const patch = motion.getPatch("parent");
      expect(patch).toMatchObject({ nodeId: "parent", status: "ready", revision: 1 });
      expect(Object.isFrozen(patch.values)).toBe(true);
      expect(motion.getPatch("child")).not.toBeNull();
    });

    it("delivers the current patch to a late subscriber immediately", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      clock.tick();

      const seen = [];
      motion.subscribe("parent", (patch) => seen.push(patch));

      expect(seen).toHaveLength(1);
      expect(seen[0].nodeId).toBe("parent");
    });

    it("keeps compose(trackId, raw) equivalent to the track's own composition", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      const child = motion.getTrack("child");

      expect(motion.compose("child", child.getSnapshot())).toEqual(child.compose(child.getSnapshot()));
    });

    it("republishes with a new revision after the timeline advances", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      clock.tick();
      const first = motion.getPatch("parent").revision;

      motion.getTrack("parent").progress(0.5);
      clock.tick();

      expect(motion.getPatch("parent").revision).toBeGreaterThan(first);
    });
  });

  describe("no partial graph is flushable", () => {
    it("never subscribes a failed mount to the clock", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const delegate = throwingDelegate();

      expect(() => engine.mountWithDelegate("arm", delegate)).toThrow("delegate build failed");

      expect(delegate.destroyed).toBe(true);
      expect(engine.instanceCount).toBe(0);
      expect(clock.listenerCount).toBe(0);
      expect(() => clock.tick()).not.toThrow();
    });

    it("publishes nothing between mount and the first tick", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");

      expect(motion.getPatch("parent")).toBe(null);
      expect(motion.getPatch("child")).toBe(null);
    });
  });

  describe("lifecycle", () => {
    it("releases the clock and the runtime when the motion is destroyed", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      const runtime = motion.graphRuntime;

      motion.destroy();

      expect(runtime.isDisposed).toBe(true);
      expect(motion.graphRuntime).toBe(null);
      expect(motion.graphBinding).toBe(null);
      expect(clock.listenerCount).toBe(0);
      expect(() => clock.tick()).not.toThrow();
    });

    it("makes repeated destroy safe", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");

      expect(() => { motion.destroy(); motion.destroy(); }).not.toThrow();
      expect(clock.listenerCount).toBe(0);
    });

    it("releases the runtime when the engine unmounts the motion", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      const runtime = motion.graphRuntime;

      expect(engine.unmount(motion)).toBe(true);

      expect(runtime.isDisposed).toBe(true);
      expect(clock.listenerCount).toBe(0);
    });

    it("keeps publishing across repeated initialization", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");

      motion.init();
      motion.init();
      motion.getTrack("parent").progress(0.25);
      clock.tick();

      expect(motion.graphRuntime.isDisposed).toBe(false);
      expect(clock.listenerCount).toBe(1);
      expect(motion.getPatch("parent")).not.toBeNull();
    });

    it("detaches every runtime when the project reloads", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const motion = engine.mountInstance("arm");
      const runtime = motion.graphRuntime;

      await engine.loadProject(project);

      expect(runtime.isDisposed).toBe(true);
      expect(clock.listenerCount).toBe(0);
      expect(engine.instanceCount).toBe(0);
    });

    it("refuses to attach a runtime to a destroyed motion", async () => {
      clock = testClock();
      engine = new Engine({ publisherRendering: true, clock });
      await engine.loadProject(project);
      const first = engine.mountInstance("arm");
      const second = engine.mountInstance("arm");
      const orphan = second.graphRuntime;

      first.destroy();
      first.setGraphRuntime(orphan);

      expect(first.graphRuntime).toBe(null);
      expect(orphan.isDisposed).toBe(true);
      expect(clock.listenerCount).toBe(0);
    });
  });
});
