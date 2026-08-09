import { describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";
import { createPluginRegistry } from "../../domain/plugins.js";
import { createAnimationPlugin } from "../../domain/createAnimationPlugin.js";

const stableProject = {
  schemaVersion: 4,
  projectId: "stable",
  motions: [
    {
      id: "stable-motion",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "stable-track",
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
  ],
};

const failingProject = {
  schemaVersion: 4,
  projectId: "failing",
  motions: [
    {
      id: "failing-motion",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "failing-track",
          keyframes: {
            reloadFailure: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
  ],
};

describe("Engine transactional project loading", () => {
  it("keeps the active project and mounted instances when plugin loading fails", async () => {
    const plugins = createPluginRegistry();
    plugins.register(
      createAnimationPlugin({
        keys: ["reloadFailure"],
        lazy: true,
        load: () => Promise.reject(new Error("plugin load failed")),
        contribute: () => ({
          percentPatch: {
            "0%": { reloadFailure: 0 },
            "100%": { reloadFailure: 1 },
          },
        }),
        compose: (raw) => ({ reloadFailure: raw.reloadFailure }),
      }),
    );
    const engine = new Engine({ plugins });
    await engine.loadProject(stableProject);
    const mounted = engine.mountInstance("stable-motion");

    await expect(engine.loadProject(failingProject)).rejects.toThrow(
      "plugin load failed",
    );

    expect(engine.getTrackConfig("stable-track")).not.toBeNull();
    expect(engine.getTrackConfig("failing-track")).toBeNull();
    expect(engine.instanceCount).toBe(1);
    expect(engine.isOwned(mounted)).toBe(true);
    expect(() => mounted.seek(0.5)).not.toThrow();
  });

  it("swaps the active project only after a successful reload", async () => {
    const engine = new Engine();
    await engine.loadProject(stableProject);
    const mounted = engine.mountInstance("stable-motion");

    await engine.loadProject({
      ...stableProject,
      projectId: "replacement",
      motions: [],
    });

    expect(engine.getTrackConfig("stable-track")).toBeNull();
    expect(engine.instanceCount).toBe(0);
    expect(engine.isOwned(mounted)).toBe(false);
    expect(() => mounted.seek(0.5)).not.toThrow();
  });
});
