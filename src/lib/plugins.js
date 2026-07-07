import { createSimplePropertyPlugin } from './plugins/simpleProperty.js';
import { createColorPropertyPlugin } from './plugins/colorProperty.js';
import { createFilterPropertyPlugin } from './plugins/filterProperty.js';
import { pathPlugin } from './plugins/pathPlugin.js';
import { cssVarPlugin } from './plugins/cssVarProperty.js';

const simpleKeys = [
  'x', 'y', 'z',
  'rotation', 'rotationX', 'rotationY',
  'scaleX', 'scaleY',
  'skewX', 'skewY',
  'opacity'
];

const colorKeys = [
  'backgroundColor', 'color', 'borderColor'
];

const filterKeys = [
  'blur', 'brightness', 'contrast', 'saturate'
];

const simplePlugins = Object.fromEntries(simpleKeys.map(k => [k, createSimplePropertyPlugin(k)]));
const colorPlugins = Object.fromEntries(colorKeys.map(k => [k, createColorPropertyPlugin(k)]));
const filterPlugins = Object.fromEntries(filterKeys.map(k => [k, createFilterPropertyPlugin(k)]));

// Individual exports for legacy references (if any exist)
export { pathPlugin, cssVarPlugin };

// Lazy plugin stubs
export const splitTextPlugin    = { keys: ['splitText'],    lazy: true, claimsKey(k) { return k === 'splitText';    }, load: () => Promise.resolve(), contribute() {} };
export const morphSvgPlugin     = { keys: ['morphSVG'],     lazy: true, claimsKey(k) { return k === 'morphSVG';     }, load: () => Promise.resolve(), contribute() {} };
export const drawSvgPlugin      = { keys: ['drawSVG'],      lazy: true, claimsKey(k) { return k === 'drawSVG';      }, load: () => Promise.resolve(), contribute() {} };
export const scrambleTextPlugin = { keys: ['scrambleText'], lazy: true, claimsKey(k) { return k === 'scrambleText'; }, load: () => Promise.resolve(), contribute() {} };

export const ALL_PLUGINS = [
  ...Object.values(simplePlugins),
  ...Object.values(colorPlugins),
  ...Object.values(filterPlugins),
  pathPlugin,
  cssVarPlugin,
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
