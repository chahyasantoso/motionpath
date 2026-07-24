import { resolveTrack } from '../usecases/ResolveTrack.js';
import { buildTrackTweenSync } from '../usecases/BuildTrackTween.js';
import { Track } from './Track.js';

export function createTrack(config, templates = []) {
  const resolvedTrack = resolveTrack(config, templates);
  if (!resolvedTrack) {
    throw new Error('createTrack: invalid track configuration.');
  }

  const keyframes = resolvedTrack.keyframes || {};
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
