import { AnimationPlugin } from '../AnimationPlugin.js';

export class CSSVarPlugin extends AnimationPlugin {
  constructor() {
    super([], false);
  }

  claimsKey(key) {
    return key.startsWith('--');
  }

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
  }

  compose(rawData, elementCfg) {
    const patch = {};
    for (const key of Object.keys(rawData)) {
      if (key.startsWith('--')) patch[key] = rawData[key];
    }
    return patch;
  }
}

export const cssVarPlugin = new CSSVarPlugin();
