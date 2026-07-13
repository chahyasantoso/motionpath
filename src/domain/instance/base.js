import { gsap } from 'gsap';
import { buildTrackTweenSync } from '../../usecases/BuildTrackTween.js';
import { resolveTrack } from '../../usecases/ResolveTrack.js';

/**
 * Generates unique instance IDs
 */
let _idCounter = 0;
export function generateUniqueId() {
  return `inst-${++_idCounter}`;
}

/**
 * Resolves trigger references (element IDs or refs)
 * 
 * @param {*} value - Trigger value (string ID, boolean, or undefined)
 * @param {Object} deps - Dependencies with resolveElement function
 * @param {string} fallbackId - Fallback element ID
 * @returns {*} Resolved element or boolean
 */
export function resolveTriggerRef(value, deps, fallbackId) {
  if (value === undefined || value === null) return deps.resolveElement(fallbackId);
  if (typeof value === 'boolean') return value;
  return deps.resolveElement(value);
}

/**
 * Creates the base instance data structure.
 * This is the core state that all instance types share.
 * 
 * @param {string} motionId
 * @param {Object} config - Instance configuration
 * @param {Object} schemaMotion - Motion definition from schema
 * @param {Map} templates - Template map
 * @returns {Object} Base instance data
 */
export function createBaseInstance(motionId, config, schemaMotion, templates) {
  return {
    id: generateUniqueId(),
    motionId,
    config: config || {},
    schemaMotion,
    children: [],
    tracksMap: new Map(), // trackId -> { proxy, tween, resolvedPlugins, resolvedTrack }
    childListeners: new Set() // Callbacks for child change events
  };
}

/**
 * Builds the GSAP timeline and track tweens for an instance.
 * This is the core animation setup logic extracted from the old _build method.
 * 
 * @param {Object} base - Base instance data
 * @param {Map} templates - Template map
 * @param {Function} onTimelineUpdate - Callback for timeline updates
 * @returns {Object} { timeline, tracks } - The GSAP timeline and resolved tracks
 */
export function buildTimeline(base, templates, onTimelineUpdate) {
  const rawTracks = base.schemaMotion.tracks || [];
  const resolvedTracks = rawTracks.map(t => resolveTrack(t, templates));
  
  const trackTweens = [];
  for (const track of resolvedTracks) {
    const keyframes = track.keyframes || {};
    const tweenDuration = track.duration ?? base.schemaMotion.driver?.trigger?.duration ?? 1;

    const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
      track.id,
      keyframes,
      tweenDuration,
      track
    );

    base.tracksMap.set(track.id, { proxy, tween, resolvedPlugins, resolvedTrack: track });
    trackTweens.push(tween);
  }

  const timeline = gsap.timeline({
    paused: true,
    onUpdate: onTimelineUpdate
  });

  const trigger = base.schemaMotion.driver?.trigger || {};
  const finalDelay = base.config.delay ?? trigger.delay ?? 0;
  if (finalDelay > 0) {
    timeline.delay(finalDelay);
  }

  resolvedTracks.forEach((track, idx) => {
    const tween = trackTweens[idx];
    const offset = typeof base.schemaMotion.stagger === 'number' ? base.schemaMotion.stagger * idx : 0;
    timeline.add(tween, offset);
  });

  return { timeline, tracks: resolvedTracks };
}

/**
 * Gets the current snapshot of a track's state.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - GSAP timeline
 * @param {string} trackId
 * @returns {Object|null} Track snapshot with progress
 */
export function getCurrentSnapshot(base, timeline, trackId) {
  const trackBuild = base.tracksMap.get(trackId);
  if (!trackBuild) return null;
  
  const progress = timeline.progress();
  return {
    ...trackBuild.proxy,
    progress
  };
}

/**
 * Destroys an instance's timeline and all track tweens.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - GSAP timeline
 */
export function destroyTimeline(base, timeline) {
  timeline.kill();
  for (const track of base.tracksMap.values()) {
    track.tween.kill();
  }
  base.tracksMap.clear();
}

/**
 * Seeks all children of an instance to their correct progress based on parent time and stagger.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - Parent timeline
 */
export function seekChildren(base, timeline) {
  const parentTime = timeline.time();
  base.children.forEach(child => {
    const childDelay = child.currentDelay ?? child.config.delay ?? 0;
    const childDuration = child.timeline.duration() || 1.0;
    const childTime = parentTime - childDelay;
    const childProgress = Math.max(0, Math.min(1, childTime / childDuration));
    child.seek(childProgress);
  });
}
