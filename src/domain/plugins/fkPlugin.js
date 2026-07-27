import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { composeWorld } from '../../lib/fkMath.js';
import { toPercentKey } from '../../usecases/toPercentKey.js';

export const fkPlugin = createAnimationPlugin({
  keys: ['boneLength'],
  stage: 'transform',
  priority: 50,
  outputs: {
    x: { merge: 'replace' }, y: { merge: 'replace' }, rotation: { merge: 'replace' },
  },
  claimsKey(k) { return k === 'boneLength' || k === 'parentWorld'; },
  contribute(propKey, stops) {
    if (propKey !== 'boneLength') return { percentPatch: {}, tweenVars: {} };
    const percentPatch = {};
    stops.forEach((s) => {
      const pctKey = toPercentKey(s.p);
      percentPatch[pctKey] = { boneLength: s.v };
      if (s.ease) percentPatch[pctKey].ease = s.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 };
    return composeWorld(parentWorld, {
      x: rawData.boneLength ?? 0, y: 0, rotation: rawData.rotation ?? 0,
    });
  },
});
