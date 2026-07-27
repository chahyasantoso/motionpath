import { gsap } from 'gsap';
import { resolvePluginForKey } from '../domain/plugins.js';

const STAGE_ORDER = new Map([
  ['base', 10], ['filter', 20], ['media', 30], ['transform', 40], ['override', 50], ['default', 100],
]);

function sortPlugins(plugins) {
  return plugins
    .map((plugin, index) => ({ plugin, index }))
    .sort((a, b) => {
      const stageA = STAGE_ORDER.get(a.plugin.stage) ?? 100;
      const stageB = STAGE_ORDER.get(b.plugin.stage) ?? 100;
      return stageA - stageB || (a.plugin.priority ?? 0) - (b.plugin.priority ?? 0) || a.index - b.index;
    })
    .map(({ plugin }) => plugin);
}

function assertOutputCompatibility(trackId, plugins) {
  const owners = new Map();
  for (const plugin of plugins) {
    for (const key of Object.keys(plugin.outputs || {})) {
      const previous = owners.get(key);
      if (previous && previous !== plugin) {
        throw new Error(
          `Output collision on track "${trackId}" for "${key}": ` +
          `plugins "${previous.keys?.join(', ') ?? '?'}" and "${plugin.keys?.join(', ') ?? '?'}" ` +
          'both emit this render property. Split the properties into separate tracks or use an explicit observation mapping.'
        );
      }
      owners.set(key, plugin);
    }
  }
}

export function buildTrackTween(trackId, keyframes, duration, trackConfig) {
  const propKeys = Object.keys(keyframes || {});
  const sharedKeyframes = {};
  const sharedTweenVars = {};
  const discoveredPlugins = [];
  const proxy = {};

  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    if (!plugin) throw new Error(`No plugin found for key "${propKey}" on track "${trackId}".`);
    if (!discoveredPlugins.includes(plugin)) discoveredPlugins.push(plugin);
  }

  const resolvedPlugins = sortPlugins(discoveredPlugins);
  assertOutputCompatibility(trackId, resolvedPlugins);

  // Compilation order is now authored by plugin metadata, not Object.keys().
  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    const propConfig = keyframes[propKey];
    const contribution = plugin.contribute(propKey, propConfig?.stops || [], trackConfig);
    const percentPatch = contribution?.percentPatch || {};
    const tweenVars = contribution?.tweenVars || {};

    for (const percentKey of Object.keys(percentPatch)) {
      const existing = sharedKeyframes[percentKey];
      const incoming = percentPatch[percentKey];
      if (existing?.ease !== undefined && incoming?.ease !== undefined && existing.ease !== incoming.ease) {
        throw new Error(
          `Ease collision on track "${trackId}" at percent "${percentKey}" ` +
          `(contributed by property "${propKey}"): different eases found ("${existing.ease}" vs "${incoming.ease}").`
        );
      }
      sharedKeyframes[percentKey] = { ...(existing ?? {}), ...incoming };
    }

    for (const key of Object.keys(tweenVars)) {
      if (key in sharedTweenVars && sharedTweenVars[key] !== tweenVars[key]) {
        throw new Error(`tweenVars collision on track "${trackId}": key "${key}" contributed twice with different values.`);
      }
      sharedTweenVars[key] = tweenVars[key];
    }
  }

  const mergedZero = sharedKeyframes['0%'] ?? {};
  for (const [key, value] of Object.entries(mergedZero)) if (key !== 'ease') proxy[key] = value;

  const tween = gsap.to(proxy, { keyframes: sharedKeyframes, ...sharedTweenVars, duration, paused: true });
  return { proxy, tween, resolvedPlugins };
}
export { buildTrackTween as buildTrackTweenSync };
