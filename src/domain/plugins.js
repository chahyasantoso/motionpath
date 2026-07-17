import { createSimplePropertyPlugin } from './plugins/simpleProperty.js';
import { createColorPropertyPlugin } from './plugins/colorProperty.js';
import { filterGroupPlugin } from './plugins/filterProperty.js';
import { pathPlugin } from './plugins/pathPlugin.js';
import { cssVarPlugin } from './plugins/cssVarProperty.js';
import { imageSequencePlugin } from './plugins/imageSequenceProperty.js';

const simpleKeys = [
  'x', 'y', 'z',
  'rotation', 'rotationX', 'rotationY', 'rotateX', 'rotateY', 'rotateZ',
  'scale', 'scaleX', 'scaleY',
  'skewX', 'skewY',
  'opacity', 'display', 'zIndex',
  'xPercent', 'yPercent', 'transformPerspective'
];

const colorKeys = [
  'backgroundColor', 'color', 'borderColor'
];

const simplePlugins = Object.fromEntries(simpleKeys.map(k => [k, createSimplePropertyPlugin(k)]));
const colorPlugins = Object.fromEntries(colorKeys.map(k => [k, createColorPropertyPlugin(k)]));

// Individual exports for legacy references (if any exist)
export { pathPlugin, cssVarPlugin, imageSequencePlugin };

function createUnsupportedLazyPlugin(featureName, key) {
  return {
    keys: [key],
    lazy: true,
    claimsKey(k) {
      return k === key;
    },
    load() {
      return Promise.reject(
        new Error(`[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`)
      );
    },
    contribute() {
      throw new Error(`[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`);
    }
  };
}

export const splitTextPlugin    = createUnsupportedLazyPlugin('splitText', 'splitText');
export const morphSvgPlugin     = createUnsupportedLazyPlugin('morphSVG', 'morphSVG');
export const drawSvgPlugin      = createUnsupportedLazyPlugin('drawSVG', 'drawSVG');
export const scrambleTextPlugin = createUnsupportedLazyPlugin('scrambleText', 'scrambleText');

export const ALL_PLUGINS = [
  ...Object.values(simplePlugins),
  ...Object.values(colorPlugins),
  filterGroupPlugin,
  pathPlugin,
  cssVarPlugin,
  imageSequencePlugin,
  splitTextPlugin,
  morphSvgPlugin,
  drawSvgPlugin,
  scrambleTextPlugin
];

/**
 * Resolves a schema property key to its corresponding plugin instance.
 * Every plugin in ALL_PLUGINS is required to implement claimsKey(key).
 *
 * @param {string} key - The property key to resolve.
 * @returns {Plugin|undefined} The resolved plugin, or undefined if not found.
 */
export function resolvePluginForKey(key) {
  if (typeof key !== 'string') return undefined;
  return ALL_PLUGINS.find(p => p.claimsKey(key));
}

const loadPromises = new Map();

export function _resetLoadPromises() {
  loadPromises.clear();
}

export function ensureLoaded(plugin) {
  if (!plugin.lazy) return Promise.resolve();
  if (!loadPromises.has(plugin)) {
    loadPromises.set(plugin, typeof plugin.load === 'function' ? plugin.load() : Promise.resolve());
  }
  return loadPromises.get(plugin);
}
