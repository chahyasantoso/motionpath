export class AnimationPlugin {
  constructor(keys = [], lazy = false) {
    this.keys = keys;
    this.lazy = lazy;
  }

  claimsKey(key) {
    return this.keys.includes(key);
  }

  contribute(propKey, stops, trackConfig) {
    return { percentPatch: {}, tweenVars: {} };
  }

  compose(rawData, trackConfig) {
    return {};
  }
}
