import { resolveTrack } from '../usecases/ResolveTrack.js';
import { buildTrackTweenSync } from '../usecases/BuildTrackTween.js';
import { resolvePluginForKey, ensureLoaded } from '../domain/plugins.js';
import { Track } from './Track.js';

export async function createTrack(config, templates = []) {
  const resolvedTrack = resolveTrack(config, templates);
  if (!resolvedTrack) {
    throw new Error('createTrack: invalid track configuration.');
  }

  const keyframes = resolvedTrack.keyframes || {};
  const propKeys = Object.keys(keyframes);

  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    if (plugin) {
      await ensureLoaded(plugin);
    }
  }

  const duration = resolvedTrack.duration ?? 1;
  const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
    resolvedTrack.id,
    keyframes,
    duration,
    resolvedTrack
  );

  return new Track({
    id: resolvedTrack.id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins: resolvedPlugins,
    resolvedTrack,
    layoutDelegate: config.layoutDelegate,
  });
}
