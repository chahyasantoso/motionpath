import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { toPercentKey } from '../../usecases/toPercentKey.js';

const filterKeys = ['blur', 'brightness', 'contrast', 'saturate'];

export function createFilterGroupPlugin() {
  return createAnimationPlugin({
    keys: filterKeys,
    stage: 'filter',
    priority: 20,
    outputs: { filter: { merge: 'shallow' } },
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach((stop) => {
        const pctKey = toPercentKey(stop.p);
        percentPatch[pctKey] = { [key]: stop.v };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData) {
      const filterValues = {};
      for (const key of filterKeys) {
        if (rawData[key] !== undefined) filterValues[key] = rawData[key];
      }
      return Object.keys(filterValues).length ? { filter: filterValues } : {};
    },
  });
}

export const filterGroupPlugin = createFilterGroupPlugin();
