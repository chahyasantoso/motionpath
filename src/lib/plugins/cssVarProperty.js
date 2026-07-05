/**
 * Fallback plugin for raw CSS custom variables starting with '--'.
 */
export const cssVarPlugin = {
  keys: [], // Matched dynamically
  lazy: false,
  getNaturalValue(propKey, domNode) {
    return getComputedStyle(domNode).getPropertyValue(propKey) || '';
  },
  contribute(propKey, stops) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { [propKey]: stop.v };
      if (stop.ease) {
        percentPatch[pctKey].ease = stop.ease;
      }
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const patch = {};
    for (const key of Object.keys(rawData)) {
      if (key.startsWith('--')) patch[key] = rawData[key];
    }
    return patch;
  }
};
