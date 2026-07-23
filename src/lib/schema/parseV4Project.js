import { createTrack } from '../createTrack.js';
import { Motion } from '../Motion.js';
import { triggerDelegateRegistry } from '../TriggerDelegate.js';

export async function parseV4Project(schema = {}, deps = {}) {
  const templates = schema.templates || [];
  const rawMotions = schema.motions || [];
  const rawTracks = schema.tracks || [];

  const motionsMap = new Map();
  const tracksMap = new Map();

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

    const delegate = factory(motionConfig.trigger);
    const motion = new Motion({
      id: motionConfig.id,
      triggerDelegate: delegate,
      lazy: triggerType === 'scroll'
    }, deps);

    const motionTracks = motionConfig.tracks || [];
    const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
    for (let i = 0; i < motionTracks.length; i++) {
      const trackConfig = motionTracks[i];
      const track = await createTrack(trackConfig, templates);
      const position = i * stagger;
      motion.mount(track, position);
      tracksMap.set(track.id, track);
    }

    motionsMap.set(motion.id, motion);
  }

  for (const trackConfig of rawTracks) {
    const track = await createTrack(trackConfig, templates);
    tracksMap.set(track.id, track);
  }

  return {
    templates,
    motions: motionsMap,
    tracks: tracksMap,
    getMotion: (id) => motionsMap.get(id),
    getTrack: (id) => tracksMap.get(id),
  };
}
