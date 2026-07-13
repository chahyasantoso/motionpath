import { createAnimationPlugin } from '../AnimationPlugin.js';
import { getPointOnCubicPath, convertToCubicPath } from '../../utils/pathUtils.js';

/**
 * Path plugin - handles 2D/3D Bézier path animation with auto-rotation.
 * Supports path, pathProgress, cubicPath, and autoRotate keys.
 *
 * @returns {Object} Plugin object
 */
export function createPathPlugin() {
  return createAnimationPlugin({
    keys: ['path'],
    lazy: false,
    claimsKey(key) {
      return key === 'path' || key === 'pathProgress' || key === 'cubicPath' || key === 'autoRotate';
    },
    contribute(propKey, stops, elementCfg) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { pathProgress: Math.max(0, Math.min(1, Number(stop.v))) };
        if (stop.ease) {
          percentPatch[pctKey].ease = stop.ease;
        }
      });

      // Seed path configuration on 0% keyframe
      if (elementCfg?.keyframes?.path) {
        const pathConfig = elementCfg.keyframes.path;
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
  });
}

export const pathPlugin = createPathPlugin();