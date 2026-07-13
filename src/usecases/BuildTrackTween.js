import { gsap } from 'gsap';
import { resolvePluginForKey } from '../domain/plugins.js';

/**
 * BuildTrackTween use case.
 * Compiles a track's keyframes config into a stateful GSAP tween and proxy target.
 *
 * @param {string} trackId
 * @param {object} keyframes
 * @param {number} duration
 * @param {object} trackConfig
 * @returns {{ proxy: object, tween: object, resolvedPlugins: object[] }}
 */
export function buildTrackTween(trackId, keyframes, duration, trackConfig) {
  const propKeys = Object.keys(keyframes || {});
  const sharedKeyframes = {};
  const sharedTweenVars = {};
  const resolvedPlugins = [];
  const proxy = {};

  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    if (!plugin) {
      throw new Error(`No plugin found for key "${propKey}" on track "${trackId}".`);
    }
    if (!resolvedPlugins.includes(plugin)) {
      resolvedPlugins.push(plugin);
    }

    const propConfig = keyframes[propKey];
    const rawStops = propConfig?.stops || [];
    const contribution = plugin.contribute(propKey, rawStops, trackConfig);
    const percentPatch = contribution?.percentPatch || {};
    const tweenVars = contribution?.tweenVars || {};

    for (const percentKey of Object.keys(percentPatch)) {
      const existing = sharedKeyframes[percentKey];
      const incoming = percentPatch[percentKey];

      // Ease-collision check
      if (
        existing?.ease !== undefined &&
        incoming?.ease !== undefined &&
        existing.ease !== incoming.ease
      ) {
        throw new Error(
          `Ease collision on track "${trackId}" at percent "${percentKey}" ` +
          `(contributed by property "${propKey}"): ` +
          `different eases found ("${existing.ease}" vs "${incoming.ease}").`
        );
      }

      sharedKeyframes[percentKey] = {
        ...(existing ?? {}),
        ...incoming,
      };
    }

    // tweenVars merge with collision detection
    for (const key of Object.keys(tweenVars)) {
      if (key in sharedTweenVars && sharedTweenVars[key] !== tweenVars[key]) {
        throw new Error(
          `tweenVars collision on track "${trackId}": key "${key}" ` +
          `contributed twice with different values.`
        );
      }
      sharedTweenVars[key] = tweenVars[key];
    }
  }

  // After the full propKeys loop, seed proxy from the fully merged 0% frame
  const mergedZero = sharedKeyframes['0%'] ?? {};
  for (const [k, v] of Object.entries(mergedZero)) {
    if (k !== 'ease') proxy[k] = v;
  }

  const tween = gsap.to(proxy, {
    keyframes: sharedKeyframes,
    ...sharedTweenVars,
    duration: duration,
  });

  return { proxy, tween, resolvedPlugins };
}
export { buildTrackTween as buildTrackTweenSync }; // Export alias for ease of migration
