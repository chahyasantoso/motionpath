import { resolveTrack } from "../usecases/ResolveTrack.js";
import { buildTrackTweenSync } from "../usecases/BuildTrackTween.js";
import { resolvePluginForKey as defaultResolvePlugin } from "../domain/plugins.js";
import { defaultProjectRuntime } from "../runtime/defaultProjectRuntime.js";
import { Track } from "./Track.js";

export function createTrack(config, templates = [], options = {}) {
  const resolvedTrack = config?.__normalized
    ? config
    : resolveTrack(config, templates);
  if (!resolvedTrack) throw new Error("createTrack: invalid track configuration.");
  const plugins = options.dependencies?.plugins;
  const resolver = options.resolvePluginForKey || plugins?.resolve?.bind(plugins) || defaultResolvePlugin;
  const built = buildTrackTweenSync(
    resolvedTrack.id,
    resolvedTrack.keyframes || {},
    resolvedTrack.duration ?? 1,
    resolvedTrack,
    resolver,
  );
  const mode = config?.mode ?? resolvedTrack.mode ?? options.mode ?? "standalone";
  const hasAdapterOption = Object.prototype.hasOwnProperty.call(options, "observationAdapter");
  const scopedRuntime = options.observationScope ?? options.projectRuntime;
  const scopedAdapter = scopedRuntime?.standaloneObservationAdapter;
  const observationAdapter = hasAdapterOption
    ? options.observationAdapter
    : mode === "standalone"
      ? (scopedAdapter ?? defaultProjectRuntime.standaloneObservationAdapter)
      : null;
  return new Track({
    id: resolvedTrack.id,
    mode,
    interpolationTimeline: built.tween,
    proxyState: built.proxy,
    plugins: built.resolvedPlugins,
    resolvedTrack,
    layoutDelegate: config.layoutDelegate,
    eventBus: options.eventBus || options.dependencies?.eventBus,
    observationAdapter,
  });
}
