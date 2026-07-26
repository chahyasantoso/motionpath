import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { composeWorld } from '../../lib/fkMath.js';

/**
 * FK plugin — forward-kinematic joint accumulation.
 *
 * Animatable key: `boneLength` (the joint's reach along its local X axis).
 * Also claims `parentWorld` (injected by the pre-fold; never in keyframes).
 *
 * compose() reads rawData.parentWorld (injected by the pre-fold pass in
 * Track.compose()) and rawData.boneLength (from the tween proxy), calls
 * composeWorld, and returns { x, y, rotation } in world space.
 *
 * If parentWorld is absent this joint is treated as the root: its own
 * boneLength becomes its world x, rotation stays 0.
 */
export const fkPlugin = createAnimationPlugin({
  keys: ['boneLength'],
  lazy: false,
  claimsKey(k) {
    return k === 'boneLength' || k === 'parentWorld';
  },
  contribute(propKey, stops) {
    if (propKey !== 'boneLength') return { percentPatch: {}, tweenVars: {} };
    const percentPatch = {};
    stops.forEach((s) => {
      percentPatch[`${s.p * 100}%`] = { boneLength: s.v };
      if (s.ease) percentPatch[`${s.p * 100}%`].ease = s.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 };
    const local = {
      x: rawData.boneLength ?? 0,
      y: 0,
      rotation: rawData.rotation ?? 0,
    };
    return composeWorld(parentWorld, local);
  },
});
