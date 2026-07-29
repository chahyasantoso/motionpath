import { createSimplePropertyPlugin } from "./plugins/simpleProperty.js";
import { createColorPropertyPlugin } from "./plugins/colorProperty.js";
import { filterGroupPlugin } from "./plugins/filterProperty.js";
import { pathPlugin } from "./plugins/pathPlugin.js";
import { cssVarPlugin } from "./plugins/cssVarProperty.js";
import { imageSequencePlugin } from "./plugins/imageSequenceProperty.js";
import { fkPlugin } from "./plugins/fkPlugin.js";

const simpleKeys = ["x", "y", "z", "rotation", "rotationX", "rotationY", "rotateX", "rotateY", "rotateZ", "scale", "scaleX", "scaleY", "skewX", "skewY", "opacity", "display", "zIndex", "xPercent", "yPercent", "transformPerspective"];
const colorKeys = ["backgroundColor", "color", "borderColor"];
const simplePlugins = Object.fromEntries(simpleKeys.map((key) => [key, createSimplePropertyPlugin(key)]));
const colorPlugins = Object.fromEntries(colorKeys.map((key) => [key, createColorPropertyPlugin(key)]));
function unsupported(name, key) {
  const message = `[MotionPath] Plugin '${name}' for key '${key}' is not implemented.`;
  return {
    keys: [key],
    lazy: true,
    claimsKey: (k) => k === key,
    load: () => Promise.reject(new Error(message)),
    contribute: () => { throw new Error(message); },
    compose: () => { throw new Error(message); },
  };
}
export const splitTextPlugin = unsupported("splitText", "splitText");
export const morphSvgPlugin = unsupported("morphSVG", "morphSVG");
export const drawSvgPlugin = unsupported("drawSVG", "drawSVG");
export const scrambleTextPlugin = unsupported("scrambleText", "scrambleText");
export const ALL_PLUGINS = [...Object.values(simplePlugins), ...Object.values(colorPlugins), filterGroupPlugin, pathPlugin, cssVarPlugin, imageSequencePlugin, fkPlugin, splitTextPlugin, morphSvgPlugin, drawSvgPlugin, scrambleTextPlugin];
export { pathPlugin, cssVarPlugin, imageSequencePlugin, fkPlugin };

const VALID_STAGES = new Set(["base", "filter", "media", "transform", "override", "default"]);
function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== "object") throw new TypeError("registerPlugin() expects a plugin object.");
  if (typeof plugin.claimsKey !== "function") throw new TypeError("registerPlugin() expects a plugin with claimsKey().");
  if (typeof plugin.contribute !== "function") throw new TypeError("registerPlugin() expects a plugin with contribute().");
  if (typeof plugin.compose !== "function") throw new TypeError("registerPlugin() expects a plugin with compose().");
  for (const field of ["keys", "inputs", "internalKeys"]) if (plugin[field] !== undefined && (!Array.isArray(plugin[field]) || plugin[field].some((key) => typeof key !== "string"))) throw new TypeError(`Plugin ${field} must be an array of strings.`);
  if (plugin.stage !== undefined && !VALID_STAGES.has(plugin.stage)) throw new TypeError(`Unknown plugin stage "${plugin.stage}".`);
  if (plugin.priority !== undefined && (!Number.isFinite(plugin.priority) || !Number.isInteger(plugin.priority))) throw new TypeError("Plugin priority must be a finite integer.");
  if (plugin.lazy && plugin.load !== undefined && typeof plugin.load !== "function") throw new TypeError("Lazy plugins must provide a load() function when specified.");
  for (const key of plugin.keys || []) if (!key) throw new TypeError("Plugin keys must be non-empty strings.");
  for (const key of plugin.inputs || []) if (!key) throw new TypeError("Plugin inputs must be non-empty strings.");
  return plugin;
}

export function createPluginRegistry(initialPlugins = ALL_PLUGINS) {
  const exact = new Map();
  const inputExact = new Map();
  const predicates = [];
  const plugins = [];
  const loadPromises = new Map();
  const internalKeySet = new Set();
  const serializerMap = new Map();
  const rebuildMetadata = () => { internalKeySet.clear(); serializerMap.clear(); for (const plugin of plugins) { for (const key of plugin.internalKeys || []) internalKeySet.add(key); for (const [key, output] of Object.entries(plugin.outputs || {})) if (typeof output?.serialize === "function") serializerMap.set(key, output.serialize); } };
  const register = (plugin) => {
    validatePlugin(plugin);
    if (plugins.includes(plugin)) return plugin;
    for (const key of plugin.keys || []) { const prior = exact.get(key); if (prior && prior !== plugin) throw new Error(`Plugin key collision for "${key}".`); }
    for (const key of plugin.inputs || []) { const prior = inputExact.get(key); if (prior && prior !== plugin) throw new Error(`Plugin input collision for "${key}".`); }
    plugins.push(plugin);
    for (const key of plugin.keys || []) exact.set(key, plugin);
    for (const key of plugin.inputs || []) inputExact.set(key, plugin);
    if (!(plugin.keys || []).length || plugin.claimsWildcard) predicates.push(plugin);
    rebuildMetadata();
    return plugin;
  };
  const unregister = (pluginOrKey) => { const plugin = typeof pluginOrKey === "string" ? exact.get(pluginOrKey) : pluginOrKey; if (!plugin || !plugins.includes(plugin)) return false; plugins.splice(plugins.indexOf(plugin), 1); for (const key of plugin.keys || []) if (exact.get(key) === plugin) exact.delete(key); for (const key of plugin.inputs || []) if (inputExact.get(key) === plugin) inputExact.delete(key); const index = predicates.indexOf(plugin); if (index >= 0) predicates.splice(index, 1); loadPromises.delete(plugin); rebuildMetadata(); return true; };
  initialPlugins.forEach(register);
  return { get plugins() { return plugins; }, get internalKeys() { return internalKeySet; }, get serializers() { return serializerMap; }, get inputs() { return inputExact; }, register, unregister, resetLoadPromises() { loadPromises.clear(); }, resolve(key) { return exact.get(key) ?? predicates.find((plugin) => plugin.claimsKey(key)); }, resolveInput(key) { return inputExact.get(key); }, ensureLoaded(plugin) { if (!plugin?.lazy) return Promise.resolve(); if (!loadPromises.has(plugin)) loadPromises.set(plugin, typeof plugin.load === "function" ? plugin.load() : Promise.resolve()); return loadPromises.get(plugin); } };
}

const defaultRegistry = createPluginRegistry();
export function registerPlugin(plugin) { return defaultRegistry.register(plugin); }
export function unregisterPlugin(pluginOrKey) { return defaultRegistry.unregister(pluginOrKey); }
export function resolvePluginForKey(key) { return typeof key === "string" ? defaultRegistry.resolve(key) : undefined; }
export function resolvePluginInput(key) { return typeof key === "string" ? defaultRegistry.resolveInput(key) : undefined; }
export function ensureLoaded(plugin) { return defaultRegistry.ensureLoaded(plugin); }
export function getInternalKeys() { return defaultRegistry.internalKeys; }
export function getOutputSerializers() { return defaultRegistry.serializers; }
export function _resetLoadPromises() { defaultRegistry.resetLoadPromises(); }
