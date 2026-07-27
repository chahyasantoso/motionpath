import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { toPercentKey } from '../../usecases/toPercentKey.js';

const filterKeys = ['blur', 'brightness', 'contrast', 'saturate'];
const filterSuffixes = { blur: 'px', brightness: '', contrast: '', saturate: '' };

export function serializeFilter(values) {
  return Object.entries(values)
    .filter(([key, value]) => value !== undefined && filterSuffixes[key] !== undefined)
    .map(([key, value]) => `${key}(${value}${filterSuffixes[key]})`)
    .join(' ');
}

export function createFilterGroupPlugin() {
  return createAnimationPlugin({
    keys: filterKeys,
    stage: 'filter',
    priority: 20,
    outputs: { filter: { merge: 'shallow', serialize: serializeFilter } },
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
      for (const key of filterKeys) if (rawData[key] !== undefined) filterValues[key] = rawData[key];
      return Object.keys(filterValues).length ? { filter: filterValues } : {};
    },
  });
}

export const filterGroupPlugin = createFilterGroupPlugin();
