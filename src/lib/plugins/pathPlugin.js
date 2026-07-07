import { getPointOnCubicPath, convertToCubicPath } from '../pathUtils.js';

/**
 * Custom plugin for path keyframes.
 * Seeding metadata (cubicPath, autoRotate) is injected at p=0.
 */
export const pathPlugin = {
  keys: ['path'],
  lazy: false,
  claimsKey(key) {
    return key === 'path' || key === 'pathProgress' || key === 'cubicPath' || key === 'autoRotate';
  },
  contribute(propKey, stops, element) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { pathProgress: Math.max(0, Math.min(1, Number(stop.v))) };
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
      percentPatch['0%'].cubicPath = convertToCubicPath(points);
      percentPatch['0%'].autoRotate = pathConfig.autoRotate === true;
    }

    return { percentPatch, tweenVars: {} };
  },
  compose(rawData, elementCfg) {
    if (rawData.pathProgress === undefined || !rawData.cubicPath) return {};
    const pt = getPointOnCubicPath(rawData.cubicPath, rawData.pathProgress);
    const patch = {
      x: pt.x,
      y: pt.y,
      z: pt.z,
      xPercent: -50,
      yPercent: -50
    };
    if (rawData.autoRotate) patch.rotation = pt.rotation;
    return patch;
  }
};
