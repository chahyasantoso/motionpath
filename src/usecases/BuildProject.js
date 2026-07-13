import { gsap } from 'gsap';
import { resolvePluginForKey } from '../domain/plugins.js';
import { resolveTrack } from './ResolveTrack.js';

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

import { buildTrackTween } from './BuildTrackTween.js';

export function buildTrackTweenSync(trackId, keyframes, duration, trackConfig) {
  return buildTrackTween(trackId, keyframes, duration, trackConfig);
}

export async function buildProject(schema, deps) {
  const trackPlugins = new Map();
  const tracksMap = new Map();
  const motions = [];
  const timelineGroups = new Map();

  const isDomain = schema && typeof schema.getMotionsList === 'function';
  const motionsList = isDomain ? schema.getMotionsList() : (schema.motions || []);
  const templates = isDomain ? schema.templates : (schema.templates || []);

  // Delegate motions have a fundamentally different lifecycle — lazily built
  // and privately cached by resolveMotion.js, never triggered, never
  // subscribed/composed via the DOM path. They never belong in this eager
  // build's working set. Filtering here means nothing below this line needs
  // to know delegate motions exist at all.
  const motionsArray = motionsList.filter(m => {
    const driverType = isDomain ? m.driver.type : m.driver?.type;
    return driverType !== 'delegate';
  });

  for (let i = 0; i < motionsArray.length; i++) {
    const motion = motionsArray[i];
    const sectionId = isDomain ? motion.driver.sectionId : motion.driver?.sectionId;

    let triggerType = 'time';
    const trigger = (isDomain ? motion.driver.trigger : motion.driver?.trigger) || {};
    if (trigger.type === 'scroll') {
      triggerType = trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
    }

    // Resolve tracks with templates
    const rawTracks = motion.tracks || [];
    const tracks = rawTracks.map(t => resolveTrack(t, templates));
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

      const tweenDuration = track.duration ?? trigger.duration ?? 1;

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

    const isPrimary = isDomain
      ? (motion.driver.timelineId ? !!motion.driver.primary : false)
      : (motion.driver?.timelineId ? !!motion.driver.primary : false);

    const driverType = isDomain
      ? (motion.driver.type || 'timeline')
      : (motion.driver?.type || 'timeline');

    const motionBuild = {
      motionIndex: i,
      motionId: motion.motionId,
      sectionId: sectionId,
      triggerType: triggerType,
      triggerConfig: trigger,
      timeline: motionTimeline,
      isPrimary: isPrimary,
      driverType: driverType
    };

    if (isDomain) {
      if (motion.driver.timelineId) {
        motionBuild.timelineId = motion.driver.timelineId;
      }
    } else {
      if (motion.driver?.timelineId) {
        motionBuild.timelineId = motion.driver.timelineId;
      }
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
        const t = (isDomain ? originalMotion.driver.trigger : originalMotion.driver?.trigger) || {};
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
