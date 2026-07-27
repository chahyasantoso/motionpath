import { resolveTrack } from '../../usecases/ResolveTrack.js';
import { resolvePluginForKey, ensureLoaded } from '../../domain/plugins.js';
import { triggerDelegateRegistry } from '../TriggerDelegate.js';

export async function parseV4Project(schema = {}, deps = {}) {
  const templates = schema.templates || [];
  const rawMotions = schema.motions || [];
  const rawTracks = schema.tracks || [];
  const motionConfigsMap = new Map();
  const trackConfigsMap = new Map();
  const pluginsToLoad = new Set();
  const preparations = [];

  const collectTrackPlugins = (trackConfig) => {
    const resolvedTrack = resolveTrack(trackConfig, templates);
    if (!resolvedTrack) throw new Error(`parseV4Project: invalid or unresolved track configuration for track "${trackConfig?.id || 'unknown'}".`);
    for (const key of Object.keys(resolvedTrack.keyframes || {})) {
      const plugin = resolvePluginForKey(key);
      if (plugin) {
        pluginsToLoad.add(plugin);
        if (typeof plugin.prepare === 'function') preparations.push(Promise.resolve(plugin.prepare(resolvedTrack)));
      }
    }
  };
  for (const motionConfig of rawMotions) {
    const triggerType = motionConfig.trigger?.type;
    if (!triggerType) throw new Error(`Motion "${motionConfig.id}" is missing required trigger.type.`);
    if (!triggerDelegateRegistry.get(triggerType)) throw new Error(`Unknown trigger type "${triggerType}" on motion "${motionConfig.id}" — register it via registerTriggerDelegate() before parsing.`);
    motionConfigsMap.set(motionConfig.id, motionConfig);
    for (const trackConfig of motionConfig.tracks || []) { collectTrackPlugins(trackConfig); trackConfigsMap.set(trackConfig.id, trackConfig); }
  }
  for (const trackConfig of rawTracks) { collectTrackPlugins(trackConfig); trackConfigsMap.set(trackConfig.id, trackConfig); }
  for (const plugin of pluginsToLoad) await ensureLoaded(plugin);
  await Promise.all(preparations);
  return { templates, motionConfigs: motionConfigsMap, trackConfigs: trackConfigsMap, getMotionConfig: (id) => motionConfigsMap.get(id), getTrackConfig: (id) => trackConfigsMap.get(id), getMotion: (id) => motionConfigsMap.get(id), getTrack: (id) => trackConfigsMap.get(id) };
}
