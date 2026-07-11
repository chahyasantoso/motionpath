import { gsap } from 'gsap';
import { resolvePluginForKey } from './plugins.js';
import { resolveTrack } from './templateResolver.js';

// Module-level Map persists across buildProject calls — concurrent calls for
// the same plugin share the same in-flight Promise, preventing double-load.
// This persistence is intentional to deduplicate plugin loading across subsequent
// builds, but can be cleared for test isolation via _resetLoadPromises.
const loadPromises = new Map();
export function _resetLoadPromises() {
  loadPromises.clear();
}
export function ensureLoaded(plugin) {
  if (!plugin.lazy) return Promise.resolve();
  if (!loadPromises.has(plugin)) {
    loadPromises.set(plugin, typeof plugin.load === 'function' ? plugin.load() : Promise.resolve());
  }
  return loadPromises.get(plugin);
}

/**
 * Builds the GSAP tween and proxy object synchronously.
 * Assumes all plugins used by the keyframes are already loaded.
 */
export function buildTrackTweenSync(trackId, keyframes, duration, trackConfig) {
  const propKeys = Object.keys(keyframes || {});
  const sharedKeyframes = {};
  const sharedTweenVars = {};
  const resolvedPlugins = [];
  const proxy = {};

  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    if (!plugin) {
      throw new Error(`No plugin found for key "${propKey}" on track "${trackId}".`);
    }
    if (!resolvedPlugins.includes(plugin)) {
      resolvedPlugins.push(plugin);
    }

    const propConfig = keyframes[propKey];
    const rawStops = propConfig?.stops || [];
    const contribution = plugin.contribute(propKey, rawStops, trackConfig);
    const percentPatch = contribution?.percentPatch || {};
    const tweenVars = contribution?.tweenVars || {};

    for (const percentKey of Object.keys(percentPatch)) {
      const existing = sharedKeyframes[percentKey];
      const incoming = percentPatch[percentKey];

      // Ease-collision check
      if (
        existing?.ease !== undefined &&
        incoming?.ease !== undefined &&
        existing.ease !== incoming.ease
      ) {
        throw new Error(
          `Ease collision on track "${trackId}" at percent "${percentKey}" ` +
          `(contributed by property "${propKey}"): ` +
          `different eases found ("${existing.ease}" vs "${incoming.ease}").`
        );
      }

      sharedKeyframes[percentKey] = {
        ...(existing ?? {}),
        ...incoming,
      };
    }

    // tweenVars merge with collision detection
    for (const key of Object.keys(tweenVars)) {
      if (key in sharedTweenVars && sharedTweenVars[key] !== tweenVars[key]) {
        throw new Error(
          `tweenVars collision on track "${trackId}": key "${key}" ` +
          `contributed twice with different values.`
        );
      }
      sharedTweenVars[key] = tweenVars[key];
    }
  }

  // After the full propKeys loop, seed proxy from the fully merged 0% frame
  const mergedZero = sharedKeyframes['0%'] ?? {};
  for (const [k, v] of Object.entries(mergedZero)) {
    if (k !== 'ease') proxy[k] = v;
  }

  const tween = gsap.to(proxy, {
    keyframes: sharedKeyframes,
    ...sharedTweenVars,
    duration: duration,
  });

  return { proxy, tween, resolvedPlugins };
}

export async function buildProject(schema, deps) {
  const trackPlugins = new Map();
  const tracksMap = new Map();
  const motions = [];
  const timelineGroups = new Map();

  const motionsArray = schema.motions || [];

  for (let i = 0; i < motionsArray.length; i++) {
    const motion = motionsArray[i];
    const sectionId = motion.driver?.sectionId;

    let triggerType = 'time';
    const trigger = motion.driver?.trigger || {};
    if (trigger.type === 'scroll') {
      triggerType = trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
    }

    // Resolve tracks with templates
    const rawTracks = motion.tracks || [];
    const tracks = rawTracks.map(t => resolveTrack(t, schema.templates));
    const trackTweens = [];

    for (const track of tracks) {
      const keyframes = track.keyframes || {};
      const propKeys = Object.keys(keyframes);

      // Pre-load plugins asynchronously before building tween synchronously
      for (const propKey of propKeys) {
        const plugin = resolvePluginForKey(propKey);
        if (plugin) {
          await ensureLoaded(plugin);
        }
      }

      const tweenDuration = track.duration ?? motion.driver?.trigger?.duration ?? 1;

      const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
        track.id,
        keyframes,
        tweenDuration,
        track
      );

      trackPlugins.set(track.id, resolvedPlugins);
      trackTweens.push(tween);
      tracksMap.set(track.id, { proxy, trackConfig: track, tween });
    }

    const motionTimeline = gsap.timeline({ paused: true });

    // Addendum C: bake trigger.delay into the motion timeline's total duration.
    // Only applies to time and scroll-observer (non-scrub) triggers.
    if (
      (trigger.type === 'time' || (trigger.type === 'scroll' && !trigger.scrub)) &&
      typeof trigger.delay === 'number'
    ) {
      motionTimeline.delay(trigger.delay);
    }

    // A1: stagger is always a plain number post-validation.
    tracks.forEach((track, idx) => {
      const tween = trackTweens[idx];
      const offset = typeof motion.stagger === 'number' ? motion.stagger * idx : 0;
      motionTimeline.add(tween, offset);
    });

    const isPrimary = motion.driver?.timelineId ? !!motion.driver.primary : false;

    const motionBuild = {
      motionIndex: i,
      motionId: motion.motionId,
      sectionId: sectionId,
      triggerType: triggerType,
      triggerConfig: trigger,
      timeline: motionTimeline,
      isPrimary: isPrimary,
      driverType: motion.driver?.type || 'timeline'
    };

    if (motion.driver?.timelineId) {
      motionBuild.timelineId = motion.driver.timelineId;
    }

    motions.push(motionBuild);
  }

  const groupsMap = new Map();
  motions.forEach(mb => {
    if (mb.timelineId) {
      if (!groupsMap.has(mb.timelineId)) {
        groupsMap.set(mb.timelineId, []);
      }
      groupsMap.get(mb.timelineId).push({
        timeline: mb.timeline,
        index: mb.motionIndex,
        isPrimary: mb.isPrimary
      });
    }
  });

  for (const [timelineId, groupItems] of groupsMap.entries()) {
    const masterTimeline = gsap.timeline({ paused: true });
    let primaryMotionIndex = -1;
    let triggerType = 'time';

    groupItems.forEach(item => {
      masterTimeline.add(item.timeline);
      if (item.isPrimary) {
        primaryMotionIndex = item.index;
        const originalMotion = motionsArray[item.index];
        const t = originalMotion.driver?.trigger || {};
        triggerType = t.type === 'scroll' && t.scrub ? 'scroll-scrub' : 'time';
      }
    });

    timelineGroups.set(timelineId, {
      timelineId,
      triggerType,
      masterTimeline,
      primaryMotionIndex
    });
  }

  return {
    trackPlugins,
    tracks: tracksMap,
    motions,
    timelineGroups
  };
}
