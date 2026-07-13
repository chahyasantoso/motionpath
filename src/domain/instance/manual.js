/**
 * Creates manual-specific behavior for manually-controlled instances.
 * Manual instances don't auto-play and are controlled entirely via seek().
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - GSAP timeline
 * @returns {Object} Manual behavior functions
 */
export function createManualBehavior(base, timeline) {
  /**
   * Seeks the timeline to a normalized progress (0-1).
   * 
   * @param {number} progress - Normalized progress value
   */
  function seek(progress) {
    timeline.progress(progress);
  }

  /**
   * No-op play for manual instances (controlled externally).
   */
  function play() {
    // Manual instances don't auto-play
  }

  /**
   * No-op pause for manual instances (controlled externally).
   */
  function pause() {
    // Manual instances don't auto-pause
  }

  /**
   * No-op onComplete for manual instances.
   */
  function onComplete(callback) {
    // Manual instances don't support onComplete callbacks
  }

  /**
   * No special cleanup needed for manual behavior.
   */
  function destroy() {
    // Timeline cleanup handled by base destroyTimeline
  }

  return {
    type: 'manual',
    play,
    pause,
    seek,
    destroy,
    properties: {} // No extra properties to expose
  };
}