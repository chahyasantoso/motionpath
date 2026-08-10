import { createAnimationPlugin } from "../createAnimationPlugin.js";
export function createCSSVarPlugin() {
  return createAnimationPlugin({
    keys: [],
    lazy: false,
    claimsKey(key) {
      return key.startsWith("--");
    },
    contribute(propKey, stops) {
      const percentPatch = {};
      stops.forEach((stop) => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [propKey]: stop.v };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData) {
      const patch = {};
      for (const key of Object.keys(rawData))
        if (key.startsWith("--")) patch[key] = rawData[key];
      return patch;
    },
  });
}
export const cssVarPlugin = createCSSVarPlugin();
