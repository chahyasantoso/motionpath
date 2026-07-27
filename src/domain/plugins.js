import { createSimplePropertyPlugin } from './plugins/simpleProperty.js';
import { createColorPropertyPlugin } from './plugins/colorProperty.js';
import { filterGroupPlugin } from './plugins/filterProperty.js';
import { pathPlugin } from './plugins/pathPlugin.js';
import { cssVarPlugin } from './plugins/cssVarProperty.js';
import { imageSequencePlugin } from './plugins/imageSequenceProperty.js';
import { fkPlugin } from './plugins/fkPlugin.js';

const simpleKeys = ['x', 'y', 'z', 'rotation', 'rotationX', 'rotationY', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity', 'display', 'zIndex', 'xPercent', 'yPercent', 'transformPerspective'];
const colorKeys = ['backgroundColor', 'color', 'borderColor'];
const simplePlugins = Object.fromEntries(simpleKeys.map((k) => [k, createSimplePropertyPlugin(k)]));
const colorPlugins = Object.fromEntries(colorKeys.map((k) => [k, createColorPropertyPlugin(k)]));

function createUnsupportedLazyPlugin(featureName, key) {
  return {
    keys: [key], lazy: true, stage: 'default', priority: 0, outputs: {}, internalKeys: [],
    claimsKey: (k) => k === key,
    load: () => Promise.reject(new Error(`[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`)),
    contribute: () => { throw new Error(`[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`); },
  };
}

export const splitTextPlugin = createUnsupportedLazyPlugin('splitText', 'splitText');
export const morphSvgPlugin = createUnsupportedLazyPlugin('morphSVG', 'morphSVG');
export const drawSvgPlugin = createUnsupportedLazyPlugin('drawSVG', 'drawSVG');
export const scrambleTextPlugin = createUnsupportedLazyPlugin('scrambleText', 'scrambleText');

const builtInPlugins = [
  ...Object.values(simplePlugins), ...Object.values(colorPlugins), filterGroupPlugin,
  pathPlugin, cssVarPlugin, imageSequencePlugin, fkPlugin,
  splitTextPlugin, morphSvgPlugin, drawSvgPlugin, scrambleTextPlugin,
];

// Exact claims are indexed for O(1) resolution. Predicate claims remain in
// registration order for wildcard extensions such as --custom-property.
const exactPlugins = new Map();
const predicatePlugins = [];
const registeredPlugins = [];

function indexPlugin(plugin) {
  if (!plugin || typeof plugin.claimsKey !== 'function') throw new TypeError('registerPlugin() expects a plugin with claimsKey().');
  registeredPlugins.push(plugin);
  for (const key of plugin.keys || []) {
    if (typeof key !== 'string') continue;
    const existing = exactPlugins.get(key);
    if (existing && existing !== plugin) throw new Error(`Plugin key collision for "${key}".`);
    exactPlugins.set(key, plugin);
  }
  if (!(plugin.keys || []).length || plugin.claimsWildcard === true) predicatePlugins.push(plugin);
}

for (const plugin of builtInPlugins) indexPlugin(plugin);

export const ALL_PLUGINS = registeredPlugins;
export { pathPlugin, cssVarPlugin, imageSequencePlugin, fkPlugin };

export function registerPlugin(plugin) {
  if (registeredPlugins.includes(plugin)) return plugin;
  indexPlugin(plugin);
  return plugin;
}

export function unregisterPlugin(pluginOrKey) {
  const plugin = typeof pluginOrKey === 'string' ? exactPlugins.get(pluginOrKey) : pluginOrKey;
  if (!plugin || builtInPlugins.includes(plugin)) return false;
  const index = registeredPlugins.indexOf(plugin);
  if (index < 0) return false;
  registeredPlugins.splice(index, 1);
  for (const key of plugin.keys || []) if (exactPlugins.get(key) === plugin) exactPlugins.delete(key);
  const predicateIndex = predicatePlugins.indexOf(plugin);
  if (predicateIndex >= 0) predicatePlugins.splice(predicateIndex, 1);
  loadPromises.delete(plugin);
  return true;
}

export function resolvePluginForKey(key) {
  if (typeof key !== 'string') return undefined;
  const exact = exactPlugins.get(key);
  if (exact) return exact;
  return predicatePlugins.find((plugin) => plugin.claimsKey(key));
}

const loadPromises = new Map();
export function _resetLoadPromises() { loadPromises.clear(); }
export function ensureLoaded(plugin) {
  if (!plugin.lazy) return Promise.resolve();
  if (!loadPromises.has(plugin)) loadPromises.set(plugin, typeof plugin.load === 'function' ? plugin.load() : Promise.resolve());
  return loadPromises.get(plugin);
}
