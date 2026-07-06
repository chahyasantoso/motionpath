import { gsap } from 'gsap';

/**
 * Creates a plugin for standard transform/numeric properties that maps directly to GSAP.
 *
 * @param {string} propKey - The property key name (e.g. 'x', 'opacity').
 * @returns {Plugin} A plugin definition object.
 */
export function createSimplePropertyPlugin(propKey) {
  return {
    keys: [propKey],
    lazy: false,
    claimsKey(key) {
      return key === propKey;
    },
    getNaturalValue(key, domNode) {
      // Use gsap.getProperty to handle transform components correctly
      const val = gsap.getProperty(domNode, key);
      if (val !== undefined && val !== null) {
        return val;
      }
      return key === 'opacity' ? 1 : 0;
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
