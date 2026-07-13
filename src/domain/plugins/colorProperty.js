import { createAnimationPlugin } from '../createAnimationPlugin.js';

/**
 * Factory for color property plugins (backgroundColor, color, borderColor, etc.)
 * Handles color animation using GSAP's built-in color interpolation.
 *
 * @param {string} propKey - The color property key this plugin handles
 * @returns {Object} Plugin object
 */
export function createColorPropertyPlugin(propKey) {
  return createAnimationPlugin({
    keys: [propKey],
    lazy: false,
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [key]: stop.v };
        if (stop.ease) {
          percentPatch[pctKey].ease = stop.ease;
        }
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, elementCfg) {
      const patch = {};
      if (rawData[propKey] !== undefined) patch[propKey] = rawData[propKey];
      return patch;
    }
  });
}