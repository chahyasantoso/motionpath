import { AnimationPlugin } from '../AnimationPlugin.js';

export class ColorPropertyPlugin extends AnimationPlugin {
  constructor(propKey) {
    super([propKey], false);
    this.propKey = propKey;
  }

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
  }

  compose(rawData, elementCfg) {
    const patch = {};
    if (rawData[this.propKey] !== undefined) patch[this.propKey] = rawData[this.propKey];
    return patch;
  }
}

export function createColorPropertyPlugin(propKey) {
  return new ColorPropertyPlugin(propKey);
}
