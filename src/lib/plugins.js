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
export const splitTextPlugin = { keys: ['splitText'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const morphSvgPlugin = { keys: ['morphSVG'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const drawSvgPlugin = { keys: ['drawSVG'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const scrambleTextPlugin = { keys: ['scrambleText'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };

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
 * Supports exact key matching and CSS custom property fallback (--*).
 *
 * @param {string} key - The property key to resolve.
 * @returns {Plugin|undefined} The resolved plugin, or undefined if not found.
 */
export function resolvePluginForKey(key) {
  if (typeof key !== 'string') return undefined;
  if (key.startsWith('--')) return cssVarPlugin;

  const simple = simplePlugins[key];
  if (simple) return simple;

  const color = colorPlugins[key];
  if (color) return color;

  const filter = filterPlugins[key];
  if (filter) return filter;

  if (key === 'path') return pathPlugin;

  if (key === 'splitText') return splitTextPlugin;
  if (key === 'morphSVG') return morphSvgPlugin;
  if (key === 'drawSVG') return drawSvgPlugin;
  if (key === 'scrambleText') return scrambleTextPlugin;

  return undefined;
}
