import { describe, it, expect, vi, afterEach } from "vitest";
import { createAnimationPlugin } from "../createAnimationPlugin.js";
import {
  createPluginRegistry,
  registerPlugin,
  unregisterPlugin,
  resolvePluginForKey,
  ensureLoaded,
  _resetLoadPromises,
} from "../plugins.js";

describe("plugin registry", () => {
  afterEach(() => { _resetLoadPromises(); });
  it("registers and resolves third-party exact-key plugins", () => {
    const plugin = createAnimationPlugin({ keys: ["testProperty"] });
    registerPlugin(plugin);
    expect(resolvePluginForKey("testProperty")).toBe(plugin);
    expect(unregisterPlugin(plugin)).toBe(true);
    expect(resolvePluginForKey("testProperty")).toBeUndefined();
  });
  it("rejects duplicate exact claims instead of silently shadowing a plugin", () => {
    const first = createAnimationPlugin({ keys: ["collisionProperty"] });
    const second = createAnimationPlugin({ keys: ["collisionProperty"] });
    registerPlugin(first);
    expect(() => registerPlugin(second)).toThrow(/Plugin key collision/);
    unregisterPlugin(first);
  });
  it("supports explicitly declared wildcard claims", () => {
    const plugin = createAnimationPlugin({ keys: [], claimsWildcard: true, claimsKey: (key) => key.startsWith("@@") });
    registerPlugin(plugin);
    expect(resolvePluginForKey("@@custom")).toBe(plugin);
    expect(unregisterPlugin(plugin)).toBe(true);
    expect(resolvePluginForKey("@@custom")).toBeUndefined();
  });
  it("rejects malformed metadata before mutating the registry", () => {
    const registry = createPluginRegistry([]);
    expect(() => registry.register({ keys: ["bad"], claimsKey: () => true })).toThrow(/contribute/);
    expect(registry.plugins).toHaveLength(0);
    expect(() => registry.register(createAnimationPlugin({ keys: ["" ] }))).toThrow(/non-empty/);
    expect(() => registry.register(createAnimationPlugin({ keys: ["bad-stage"], stage: "unknown" }))).toThrow(/Unknown plugin stage/);
    expect(() => registry.register(createAnimationPlugin({ keys: ["bad-priority"], priority: 1.5 }))).toThrow(/priority/);
  });
  it("caches lazy preparation per registry and can reset that cache", async () => {
    const load = vi.fn(() => Promise.resolve());
    const plugin = createAnimationPlugin({ keys: ["lazyProperty"], lazy: true, load });
    const registry = createPluginRegistry([]);
    registry.register(plugin);
    await registry.ensureLoaded(plugin);
    await registry.ensureLoaded(plugin);
    expect(load).toHaveBeenCalledTimes(1);
    registry.resetLoadPromises();
    await registry.ensureLoaded(plugin);
    expect(load).toHaveBeenCalledTimes(2);
    registry.unregister(plugin);
  });
});
