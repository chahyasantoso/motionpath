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

  const collectTrackPlugins = (trackConfig) => {
    const resolvedTrack = resolveTrack(trackConfig, templates);
    if (!resolvedTrack) {
      throw new Error(`parseV4Project: invalid or unresolved track configuration for track "${trackConfig?.id || 'unknown'}".`);
    }
    const keyframes = resolvedTrack.keyframes || {};
    for (const key of Object.keys(keyframes)) {
      const plugin = resolvePluginForKey(key);
      if (plugin) {
        pluginsToLoad.add(plugin);
      }
    }
  };

  for (const motionConfig of rawMotions) {
    const triggerType = motionConfig.trigger?.type;
    if (!triggerType) {
      throw new Error(`Motion "${motionConfig.id}" is missing required trigger.type.`);
    }

    const factory = triggerDelegateRegistry.get(triggerType);
    if (!factory) {
      throw new Error(
        `Unknown trigger type "${triggerType}" on motion "${motionConfig.id}" — register it via registerTriggerDelegate() before parsing.`
      );
    }

    motionConfigsMap.set(motionConfig.id, motionConfig);
    const motionTracks = motionConfig.tracks || [];
    motionTracks.forEach((trackConfig) => {
      collectTrackPlugins(trackConfig);
      trackConfigsMap.set(trackConfig.id, trackConfig);
    });
  }

  for (const trackConfig of rawTracks) {
    collectTrackPlugins(trackConfig);
    trackConfigsMap.set(trackConfig.id, trackConfig);
  }

  for (const plugin of pluginsToLoad) {
    await ensureLoaded(plugin);
  }

  return {
    templates,
    motionConfigs: motionConfigsMap,
    trackConfigs: trackConfigsMap,
    getMotionConfig: (id) => motionConfigsMap.get(id),
    getTrackConfig: (id) => trackConfigsMap.get(id),
    getMotion: (id) => motionConfigsMap.get(id),
    getTrack: (id) => trackConfigsMap.get(id),
  };
}
