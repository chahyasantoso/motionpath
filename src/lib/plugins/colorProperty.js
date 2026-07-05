/**
 * Creates a plugin for color properties.
 *
 * @param {string} propKey - The CSS color property key (e.g. 'backgroundColor').
 * @returns {Plugin} A plugin definition object.
 */
export function createColorPropertyPlugin(propKey) {
  return {
    keys: [propKey],
    lazy: false,
    getNaturalValue(key, domNode) {
      return getComputedStyle(domNode)[key] || 'transparent';
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
    compose(rawData) {
      const patch = {};
      if (rawData[propKey] !== undefined) patch[propKey] = rawData[propKey];
      return patch;
    }
  };
}
