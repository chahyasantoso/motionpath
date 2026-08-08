import { resolveTrack } from "../usecases/ResolveTrack.js";
import { buildTrackTweenSync } from "../usecases/BuildTrackTween.js";
import { resolvePluginForKey as defaultResolvePlugin } from "../domain/plugins.js";
import { Track } from "./Track.js";

export function createTrack(config, templates = [], options = {}) {
  const resolvedTrack = config?.__normalized ? config : resolveTrack(config, templates);
  if (!resolvedTrack) throw new Error("createTrack: invalid track configuration.");
  const plugins = options.dependencies?.plugins;
  const resolver = options.resolvePluginForKey || plugins?.resolve?.bind(plugins) || defaultResolvePlugin;
  const built = buildTrackTweenSync(resolvedTrack.id, resolvedTrack.keyframes || {}, resolvedTrack.duration ?? 1, resolvedTrack, resolver);
  const mode = config?.mode ?? resolvedTrack.mode ?? options.mode ?? "standalone";
  // Standalone observation is opt-in because an adapter must be shared by all
  // related tracks. Creating one here gives every Track an isolated registry,
  // which makes cross-track setObserved fail with "unknown track". Callers that
  // own a standalone group inject one explicitly; authored graphs are bound by
  // GraphBinding instead.
  const observationAdapter = options.observationAdapter ?? null;
  return new Track({ id: resolvedTrack.id, mode, interpolationTimeline: built.tween, proxyState: built.proxy, plugins: built.resolvedPlugins, resolvedTrack, layoutDelegate: config.layoutDelegate, eventBus: options.eventBus || options.dependencies?.eventBus, observationAdapter });
}
