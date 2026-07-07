const filterKeyMap = {
  blur: 'blur',
  brightness: 'brightness',
  contrast: 'contrast',
  saturate: 'saturate'
};

/**
 * Creates a plugin for CSS filter sub-properties that compiles to a synthetic proxy key.
 *
 * @param {string} propKey - The filter key name (e.g. 'blur', 'brightness').
 * @returns {Plugin} A plugin definition object.
 */
export function createFilterPropertyPlugin(propKey) {
  const proxyKey = filterKeyMap[propKey];
  return {
    keys: [propKey],
    lazy: false,
    claimsKey(key) {
      return key === propKey;
    },
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [proxyKey]: stop.v };
        if (stop.ease) {
          percentPatch[pctKey].ease = stop.ease;
        }
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, elementCfg) {
      if (rawData[proxyKey] === undefined) return {};
      const val = rawData[proxyKey];
      const filterFnMap = {
        blur: `blur(${val}px)`,
        brightness: `brightness(${val})`,
        contrast: `contrast(${val})`,
        saturate: `saturate(${val})`,
      };
      return { [proxyKey + '_filter']: filterFnMap[proxyKey] };
    }
  };
}
