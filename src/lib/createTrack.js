import { resolveTrack } from '../usecases/ResolveTrack.js';
import { buildTrackTweenSync } from '../usecases/BuildTrackTween.js';
import { resolvePluginForKey as defaultResolvePlugin } from '../domain/plugins.js';
import { Track } from './Track.js';
export function createTrack(config, templates = [], options = {}) {
  const resolvedTrack = resolveTrack(config, templates); if (!resolvedTrack) throw new Error('createTrack: invalid track configuration.');
  const resolver = options.resolvePluginForKey || defaultResolvePlugin;
  const built = buildTrackTweenSync(resolvedTrack.id, resolvedTrack.keyframes || {}, resolvedTrack.duration ?? 1, resolvedTrack, resolver);
  return new Track({ id: resolvedTrack.id, interpolationTimeline: built.tween, proxyState: built.proxy, plugins: built.resolvedPlugins, resolvedTrack, layoutDelegate: config.layoutDelegate, eventBus: options.eventBus });
}
