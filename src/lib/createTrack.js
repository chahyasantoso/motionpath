import { resolveTrack } from '../usecases/ResolveTrack.js';
import { buildTrackTweenSync } from '../usecases/BuildTrackTween.js';
import { Track } from './Track.js';

export function createTrack(config, templates = [], options = {}) {
  const resolvedTrack = resolveTrack(config, templates);
  if (!resolvedTrack) throw new Error('createTrack: invalid track configuration.');
  const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(resolvedTrack.id, resolvedTrack.keyframes || {}, resolvedTrack.duration ?? 1, resolvedTrack);
  return new Track({ id: resolvedTrack.id, interpolationTimeline: tween, proxyState: proxy, plugins: resolvedPlugins, resolvedTrack, layoutDelegate: config.layoutDelegate, eventBus: options.eventBus });
}
