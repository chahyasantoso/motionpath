import { getPointOnCubicPath } from '../pathUtils.js';

/**
 * Custom plugin for path keyframes.
 * Seeding metadata (__cubicPath, __autoRotate) is injected at p=0.
 */
export const pathPlugin = {
  keys: ['path'],
  lazy: false,
  getNaturalValue() {
    return 0; // Natural start of path progress
  },
  contribute(propKey, stops, element) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { __pathProgress: Math.max(0, Math.min(1, Number(stop.v))) };
      if (stop.ease) {
        percentPatch[pctKey].ease = stop.ease;
      }
    });

    // Seed path configuration parameters on 0% keyframe.
    // The plugin owns the cubic conversion — callers pass raw {x,y,ctrlX?,ctrlY?,z?}
    // nodes and the plugin converts them here. This keeps the schema readable and
    // prevents accidental double-conversion if the caller pre-converts.
    if (element && element.keyframes && element.keyframes.path) {
      const pathConfig = element.keyframes.path;
      const points = pathConfig.points || [];
      percentPatch['0%'] = percentPatch['0%'] || {};
      percentPatch['0%'].__cubicPath = points;
      percentPatch['0%'].__autoRotate = pathConfig.autoRotate === true;
    }

    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    if (rawData.__pathProgress === undefined || !rawData.__cubicPath) return {};
    const pt = getPointOnCubicPath(rawData.__cubicPath, rawData.__pathProgress);
    const patch = {
      x: pt.x,
      y: pt.y,
      z: pt.z,
      xPercent: -50,
      yPercent: -50
    };
    if (rawData.__autoRotate) patch.rotation = pt.rotation;
    return patch;
  }
};
