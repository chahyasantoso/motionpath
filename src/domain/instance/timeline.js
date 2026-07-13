/**
 * Creates timeline-specific behavior for timeline-driven instances.
 * Handles play, pause, onComplete callbacks, and repeat/yoyo settings.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - GSAP timeline
 * @param {Object} schemaMotion - Motion definition from schema
 * @param {Object} config - Instance configuration
 * @returns {Object} Timeline behavior functions
 */
export function createTimelineBehavior(base, timeline, schemaMotion, config) {
  const trigger = schemaMotion.driver?.trigger || {};
  
  // Apply repeat/yoyo settings to timeline
  timeline
    .repeat(trigger.repeat ?? 0)
    .yoyo(!!trigger.yoyo)
    .repeatDelay(trigger.repeatDelay ?? 0);

  // Auto-play if not a child instance and autoplay is enabled
  const shouldPlay = !config.parentId && (config.autoplay ?? true);
  if (shouldPlay) {
    timeline.play();
  }

  /**
   * Plays the timeline.
   */
  function play() {
    timeline.play();
  }

  /**
   * Pauses the timeline.
   */
  function pause() {
    timeline.pause();
  }

  /**
   * Sets a callback to be invoked when the timeline completes.
   * 
   * @param {Function} callback - Completion callback
   */
  function onComplete(callback) {
    timeline.eventCallback('onComplete', callback);
  }

  /**
   * Seeks the timeline to a normalized progress (0-1).
   * 
   * @param {number} progress - Normalized progress value
   */
  function seek(progress) {
    timeline.progress(progress);
  }

  /**
   * No special cleanup needed for timeline behavior.
   */
  function destroy() {
    // Timeline cleanup handled by base destroyTimeline
  }

  return {
    type: 'timeline',
    play,
    pause,
    onComplete,
    seek,
    destroy,
    properties: {} // No extra properties to expose
  };
}
