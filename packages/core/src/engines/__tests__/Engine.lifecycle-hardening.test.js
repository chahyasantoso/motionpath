import { describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";
import { createPluginRegistry } from "../../domain/plugins.js";
import { createAnimationPlugin } from "../../domain/createAnimationPlugin.js";

const project = {
  schemaVersion: 4,
  motions: [
    {
      id: "motion",
      trigger: { type: "manual" },
      tracks: [
        { id: "good", keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } },
        { id: "bad", keyframes: { missingAtMount: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } },
      ],
    },
  ],
};

describe("Engine lifecycle hardening", () => {
  it("does not retain a partially mounted motion when track construction fails", async () => {
    const plugins = createPluginRegistry();
    plugins.register(
      createAnimationPlugin({
        keys: ["missingAtMount"],
        contribute: () => { throw new Error("compile failed"); },
      }),
    );
    const engine = new Engine({ plugins });
    await engine.loadProject(project);
    expect(() => engine.mountInstance("motion")).toThrow("compile failed");
    expect(engine.instanceCount).toBe(0);
  });

  it("attaches and disposes the graph binding with the mounted Motion", async () => {
    const engine = new Engine();
    await engine.loadProject({
      schemaVersion: 4,
      motions: [{ id: "motion", trigger: { type: "manual" }, tracks: [{ id: "track", keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }],
    });
    const motion = engine.mountInstance("motion");
    const binding = motion.graphBinding;
    expect(binding).not.toBeNull();
    motion.destroy();
    expect(() => binding.destroy()).not.toThrow();
  });

  it("makes repeated unmount and destroy safe", async () => {
    const engine = new Engine();
    await engine.loadProject({
      schemaVersion: 4,
      motions: [{ id: "motion", trigger: { type: "manual" }, tracks: [{ id: "track", keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }],
    });
    const motion = engine.mountInstance("motion");
    expect(engine.unmount(motion)).toBe(true);
    expect(engine.unmount(motion)).toBe(false);
    expect(engine.instanceCount).toBe(0);
    expect(() => motion.destroy()).not.toThrow();
    expect(() => motion.destroy()).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
  });

  it("does not destroy foreign objects during unmount", async () => {
    const engine = new Engine();
    await engine.loadProject({ schemaVersion: 4, motions: [] });
    let destroyed = false;
    const foreign = { destroy: () => { destroyed = true; } };
    expect(engine.unmount(foreign)).toBe(false);
    expect(destroyed).toBe(false);
  });
});
