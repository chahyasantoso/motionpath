import { describe, it, expect } from "vitest";
import { Engine } from "../Engine.js";
import { createPluginRegistry } from "../../domain/plugins.js";
import { createAnimationPlugin } from "../../domain/createAnimationPlugin.js";
import { createTriggerDelegateRegistry } from "../../lib/TriggerDelegate.js";

const base = (key) => ({
  schemaVersion: 4,
  motions: [
    {
      id: "m",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "t",
          keyframes: {
            [key]: {
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
});

describe("Engine registry isolation", () => {
  it("does not share custom plugins between Engine instances", async () => {
    const plugin = createAnimationPlugin({
      keys: ["onlyA"],
      contribute: () => ({
        percentPatch: { "0%": { onlyA: 0 }, "100%": { onlyA: 1 } },
      }),
      compose: (raw) => ({ onlyA: raw.onlyA }),
    });
    const pluginsA = createPluginRegistry();
    const pluginsB = createPluginRegistry();
    pluginsA.register(plugin);
    const a = new Engine({ plugins: pluginsA });
    const b = new Engine({ plugins: pluginsB });
    await expect(a.loadProject(base("onlyA"))).resolves.toBeUndefined();
    await expect(b.loadProject(base("onlyA"))).rejects.toThrow(
      /No plugin found/,
    );
  });

  it("accepts an isolated trigger registry", async () => {
    const a = new Engine({ triggerDelegates: createTriggerDelegateRegistry() });
    await expect(a.loadProject(base("opacity"))).resolves.toBeUndefined();
  });
});
