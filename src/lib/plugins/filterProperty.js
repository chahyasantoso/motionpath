const filterKeys = ['blur', 'brightness', 'contrast', 'saturate'];

export const filterGroupPlugin = {
  keys: filterKeys,
  lazy: false,
  claimsKey(key) {
    return filterKeys.includes(key);
  },
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
};
