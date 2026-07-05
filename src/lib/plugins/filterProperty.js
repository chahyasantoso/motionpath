const filterKeyMap = {
  blur: '__blur',
  brightness: '__brightness',
  contrast: '__contrast',
  saturate: '__saturate'
};

const naturalDefaults = {
  blur: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1
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
    getNaturalValue(key) {
      // Returns identity value for synthetic fields (no DOM access)
      return naturalDefaults[key];
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
    compose(rawData) {
      if (rawData[proxyKey] === undefined) return {};
      const val = rawData[proxyKey];
      const filterFnMap = {
        __blur: `blur(${val}px)`,
        __brightness: `brightness(${val})`,
        __contrast: `contrast(${val})`,
        __saturate: `saturate(${val})`,
      };
      return { [proxyKey + '_filter']: filterFnMap[proxyKey] };
    }
  };
}
