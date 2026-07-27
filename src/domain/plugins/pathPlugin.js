import { convertToCubicPath, getPointOnCubicPath } from '../../utils/pathUtils.js';
import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { toPercentKey } from '../../usecases/toPercentKey.js';

const pathOutputs = {
  x: { merge: 'replace' }, y: { merge: 'replace' }, z: { merge: 'replace' },
  xPercent: { merge: 'replace' }, yPercent: { merge: 'replace' }, rotation: { merge: 'replace' },
};

export function createPathPlugin() {
  return createAnimationPlugin({
    keys: ['path'],
    stage: 'transform',
    priority: 50,
    outputs: pathOutputs,
    internalKeys: ['pathProgress', 'cubicPath', 'autoRotate'],
    claimsKey(key) {
      return key === 'path' || key === 'pathProgress' || key === 'cubicPath' || key === 'autoRotate';
    },
    contribute(propKey, stops, elementCfg) {
      const percentPatch = {};
      stops.forEach((stop) => {
        const pctKey = toPercentKey(stop.p);
        percentPatch[pctKey] = { pathProgress: Math.max(0, Math.min(1, Number(stop.v))) };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      if (elementCfg?.keyframes?.path) {
        const pathConfig = elementCfg.keyframes.path;
        percentPatch['0%'] = percentPatch['0%'] || {};
        percentPatch['0%'].cubicPath = convertToCubicPath(pathConfig.points || []);
        percentPatch['0%'].autoRotate = pathConfig.autoRotate === true;
      }
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, elementCfg) {
      if (rawData.pathProgress === undefined || !rawData.cubicPath) return {};
      const pt = getPointOnCubicPath(rawData.cubicPath, rawData.pathProgress);
      const anchor = elementCfg?.keyframes?.path?.anchor ?? 'center';
      const patch = { x: pt.x, y: pt.y, z: pt.z };
      if (anchor === 'center') {
        patch.xPercent = -50;
        patch.yPercent = -50;
      } else if (anchor && typeof anchor === 'object') {
        patch.xPercent = anchor.xPercent;
        patch.yPercent = anchor.yPercent;
      }
      if (rawData.autoRotate) patch.rotation = pt.rotation;
      return patch;
    },
  });
}

export const pathPlugin = createPathPlugin();
