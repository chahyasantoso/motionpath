import { composePatch } from '../../usecases/ComposeTrackPatch.js';

/**
 * Creates a subscriber management module for an instance.
 * Handles track subscriptions, broadcasting updates, and composing patches.
 * 
 * @param {Function} onSubscriberChange - Callback when subscriber count changes
 * @returns {Object} Subscriber management functions
 */
export function createSubscriberManager(onSubscriberChange) {
  const subscribers = new Map(); // trackId -> Set<callback>

  /**
   * Subscribes to a track's updates.
   * 
   * @param {Object} base - Base instance data
   * @param {Object} timeline - GSAP timeline
   * @param {string} trackId
   * @param {Function} callback - Callback function receiving { trackId, data }
   * @returns {Function} Unsubscribe function
   */
  function subscribe(base, timeline, trackId, callback) {
    const trackBuild = base.tracksMap.get(trackId);
    if (!trackBuild) {
      throw new Error(`subscribe: track "${trackId}" not found in instance.`);
    }

    // Create wrapper that filters by trackId
    const wrapper = (snapshot) => {
      if (snapshot.trackId === trackId) {
        callback(snapshot.data);
      }
    };
    
    callback._wrapper = wrapper;

    // Store by trackId for efficient broadcast
    if (!subscribers.has(trackId)) {
      subscribers.set(trackId, new Set());
    }
    subscribers.get(trackId).add(wrapper);

    // Notify parent engine of subscriber change
    if (onSubscriberChange) {
      const totalSubscribers = Array.from(subscribers.values()).reduce((sum, set) => sum + set.size, 0);
      onSubscriberChange(base, totalSubscribers > 0);
    }

    // Replay current state immediately
    const currentSnapshot = getCurrentSnapshot(base, timeline, trackId);
    callback(currentSnapshot);

    // Return unsubscribe function
    return () => unsubscribe(base, trackId, callback);
  }

  /**
   * Unsubscribes from a track's updates.
   * 
   * @param {Object} base - Base instance data
   * @param {string} trackId
   * @param {Function} callback
   */
  function unsubscribe(base, trackId, callback) {
    const wrapper = callback._wrapper;
    const trackSubscribers = subscribers.get(trackId);
    if (trackSubscribers) {
      trackSubscribers.delete(wrapper);
      if (trackSubscribers.size === 0) {
        subscribers.delete(trackId);
      }
    }

    if (onSubscriberChange) {
      const totalSubscribers = Array.from(subscribers.values()).reduce((sum, set) => sum + set.size, 0);
      onSubscriberChange(base, totalSubscribers > 0);
    }
  }

  /**
   * Gets the current snapshot of a track.
   * 
   * @param {Object} base - Base instance data
   * @param {Object} timeline - GSAP timeline
   * @param {string} trackId
   * @returns {Object} Track snapshot with progress
   */
  function getCurrentSnapshot(base, timeline, trackId) {
    const trackBuild = base.tracksMap.get(trackId);
    if (!trackBuild) return null;
    
    const progress = timeline.progress();
    return {
      ...trackBuild.proxy,
      progress
    };
  }

  /**
   * Composes a patch for a track using resolved plugins and track data.
   * 
   * @param {Object} base - Base instance data
   * @param {string} trackId
   * @param {Object} rawData - Optional raw data to compose
   * @returns {Object} Composed patch
   */
  function compose(base, timeline, trackId, rawData) {
    const trackBuild = base.tracksMap.get(trackId);
    if (!trackBuild) return {};
    
    const source = rawData ?? { ...trackBuild.proxy, progress: timeline.progress() };
    
    return composePatch(
      trackBuild.resolvedPlugins,
      source,
      trackBuild.resolvedTrack,
      `instance "${base.id}", track "${trackId}"`
    );
  }

  /**
   * Broadcasts current state to all subscribers.
   * 
   * @param {Object} base - Base instance data
   * @param {Object} timeline - GSAP timeline
   */
  function broadcast(base, timeline) {
    for (const trackId of base.tracksMap.keys()) {
      const snapshot = getCurrentSnapshot(base, timeline, trackId);
      const trackSubscribers = subscribers.get(trackId);
      if (trackSubscribers) {
        trackSubscribers.forEach(callback => callback({ trackId, data: snapshot }));
      }
    }
  }

  /**
   * Clears all subscribers.
   */
  function clear() {
    subscribers.clear();
    if (onSubscriberChange) {
      onSubscriberChange(base, false);
    }
  }

  return { subscribe, unsubscribe, getCurrentSnapshot, compose, broadcast, clear };
}