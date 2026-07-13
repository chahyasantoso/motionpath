import { createAnimationPlugin } from '../AnimationPlugin.js';

/**
 * Factory for simple CSS property plugins (x, y, opacity, scale, rotation, etc.)
 * Each key gets its own plugin instance via this factory.
 *
 * @param {string} propKey - The CSS property key this plugin handles
 * @returns {Object} Plugin object
 */
export function createSimplePropertyPlugin(propKey) {
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