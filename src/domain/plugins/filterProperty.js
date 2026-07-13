import { createAnimationPlugin } from '../AnimationPlugin.js';

const filterKeys = ['blur', 'brightness', 'contrast', 'saturate'];

/**
 * Filter group plugin - handles multiple CSS filter properties.
 * Combines blur, brightness, contrast, saturate into a single filter string.
 *
 * @returns {Object} Plugin object
 */
export function createFilterGroupPlugin() {
  return createAnimationPlugin({
    keys: filterKeys,
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
      const filterValues = {};
      for (const key of filterKeys) {
        if (rawData[key] !== undefined) {
          filterValues[key] = rawData[key];
        }
      }
      return Object.keys(filterValues).length ? { filter: filterValues } : {};
    }
  });
}

export const filterGroupPlugin = createFilterGroupPlugin();
