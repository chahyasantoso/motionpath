import { createSimplePropertyPlugin } from "./plugins/simpleProperty.js";
import { createColorPropertyPlugin } from "./plugins/colorProperty.js";
import { filterGroupPlugin } from "./plugins/filterProperty.js";
import { pathPlugin } from "./plugins/pathPlugin.js";
import { cssVarPlugin } from "./plugins/cssVarProperty.js";
import { imageSequencePlugin } from "./plugins/imageSequenceProperty.js";
import { fkPlugin } from "./plugins/fkPlugin.js";

const simpleKeys = [
  "x",
  "y",
  "z",
  "rotation",
  "rotationX",
  "rotationY",
  "rotateX",
  "rotateY",
  "rotateZ",
  "scale",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "opacity",
  "display",
  "zIndex",
  "xPercent",
  "yPercent",
  "transformPerspective",
];
const colorKeys = ["backgroundColor", "color", "borderColor"];
const simplePlugins = Object.fromEntries(
  simpleKeys.map((k) => [k, createSimplePropertyPlugin(k)]),
);
const colorPlugins = Object.fromEntries(
  colorKeys.map((k) => [k, createColorPropertyPlugin(k)]),
);
function unsupported(name, key) {
  return {
    keys: [key],
    lazy: true,
    claimsKey: (k) => k === key,
    load: () =>
      Promise.reject(
        new Error(
          `[MotionPath] Plugin '${name}' for key '${key}' is not implemented.`,
        ),
      ),
    contribute: () => {
      throw new Error(
        `[MotionPath] Plugin '${name}' for key '${key}' is not implemented.`,
      );
    },
  };
}
export const splitTextPlugin = unsupported("splitText", "splitText");
export const morphSvgPlugin = unsupported("morphSVG", "morphSVG");
export const drawSvgPlugin = unsupported("drawSVG", "drawSVG");
export const scrambleTextPlugin = unsupported("scrambleText", "scrambleText");
export const ALL_PLUGINS = [
  ...Object.values(simplePlugins),
  ...Object.values(colorPlugins),
  filterGroupPlugin,
  pathPlugin,
  cssVarPlugin,
  imageSequencePlugin,
  fkPlugin,
  splitTextPlugin,
  morphSvgPlugin,
  drawSvgPlugin,
  scrambleTextPlugin,
];
export { pathPlugin, cssVarPlugin, imageSequencePlugin, fkPlugin };

export function createPluginRegistry(initialPlugins = ALL_PLUGINS) {
  const exact = new Map();
  const predicates = [];
  const plugins = [];
  const loadPromises = new Map();
  const internalKeySet = new Set();
  const serializerMap = new Map();
  const rebuildMetadata = () => {
    internalKeySet.clear();
    serializerMap.clear();
    for (const plugin of plugins) {
      for (const key of plugin.internalKeys || []) internalKeySet.add(key);
      for (const [key, output] of Object.entries(plugin.outputs || {}))
        if (typeof output?.serialize === "function")
          serializerMap.set(key, output.serialize);
    }
  };
  const register = (plugin) => {
    if (!plugin || typeof plugin.claimsKey !== "function")
      throw new TypeError(
        "registerPlugin() expects a plugin with claimsKey().",
      );
    if (plugins.includes(plugin)) return plugin;
    for (const key of plugin.keys || []) {
      const prior = exact.get(key);
      if (prior && prior !== plugin)
        throw new Error(`Plugin key collision for "${key}".`);
    }
    plugins.push(plugin);
    for (const key of plugin.keys || []) exact.set(key, plugin);
    if (!(plugin.keys || []).length || plugin.claimsWildcard)
      predicates.push(plugin);
    rebuildMetadata();
    return plugin;
  };
  const unregister = (pluginOrKey) => {
    const plugin =
      typeof pluginOrKey === "string" ? exact.get(pluginOrKey) : pluginOrKey;
    if (!plugin || !plugins.includes(plugin)) return false;
    plugins.splice(plugins.indexOf(plugin), 1);
    for (const key of plugin.keys || [])
      if (exact.get(key) === plugin) exact.delete(key);
    const index = predicates.indexOf(plugin);
    if (index >= 0) predicates.splice(index, 1);
    loadPromises.delete(plugin);
    rebuildMetadata();
    return true;
  };
  const resetLoadPromises = () => {
    loadPromises.clear();
  };
  initialPlugins.forEach(register);
  return {
    get plugins() {
      return plugins;
    },
    get internalKeys() {
      return internalKeySet;
    },
    get serializers() {
      return serializerMap;
    },
    register,
    unregister,
    resetLoadPromises,
    resolve(key) {
      return (
        exact.get(key) ?? predicates.find((plugin) => plugin.claimsKey(key))
      );
    },
    ensureLoaded(plugin) {
      if (!plugin?.lazy) return Promise.resolve();
      if (!loadPromises.has(plugin))
        loadPromises.set(
          plugin,
          typeof plugin.load === "function" ? plugin.load() : Promise.resolve(),
        );
      return loadPromises.get(plugin);
    },
  };
}

const defaultRegistry = createPluginRegistry();
export function registerPlugin(plugin) {
  return defaultRegistry.register(plugin);
}
export function unregisterPlugin(pluginOrKey) {
  return defaultRegistry.unregister(pluginOrKey);
}
export function resolvePluginForKey(key) {
  return typeof key === "string" ? defaultRegistry.resolve(key) : undefined;
}
export function ensureLoaded(plugin) {
  return defaultRegistry.ensureLoaded(plugin);
}
export function getInternalKeys() {
  return defaultRegistry.internalKeys;
}
export function getOutputSerializers() {
  return defaultRegistry.serializers;
}
export function _resetLoadPromises() {
  defaultRegistry.resetLoadPromises();
}
