import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { resolveTriggerRef } from './base.js';

/**
 * Creates scroll-specific behavior for scroll-driven instances.
 * Handles ScrollTrigger setup, configuration, and lifecycle.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - GSAP timeline
 * @param {Object} schemaMotion - Motion definition from schema
 * @param {Object} config - Instance configuration
 * @param {Object} deps - Dependencies (resolveElement function)
 * @returns {Object} Scroll behavior functions
 */
export function createScrollBehavior(base, timeline, schemaMotion, config, deps) {
  const trigger = schemaMotion.driver?.trigger || {};
  let scrollTrigger = null;

  // Resolve trigger references (element IDs or refs)
  const resolvedConfig = {
    ...trigger,
    trigger: resolveTriggerRef(
      config.trigger ?? trigger.trigger ?? trigger.startTrigger,
      deps,
      schemaMotion.driver?.sectionId
    ),
  };

  if (trigger.pin !== undefined) {
    resolvedConfig.pin = resolveTriggerRef(
      config.pin ?? trigger.pin,
      deps,
      schemaMotion.driver?.sectionId
    );
  }

  if (trigger.endTrigger !== undefined) {
    resolvedConfig.endTrigger = resolveTriggerRef(
      config.endTrigger ?? trigger.endTrigger,
      deps,
      schemaMotion.driver?.sectionId
    );
  }

  // Only create ScrollTrigger if not a child instance
  if (!config.parentId) {
    if (trigger.scrub) {
      // Scrub mode: timeline synced to scroll position
      scrollTrigger = ScrollTrigger.create({
        ...resolvedConfig,
        animation: timeline
      });
    } else {
      // Observer mode (non-scrub): timeline plays on scroll trigger
      timeline
        .repeat(trigger.repeat ?? 0)
        .yoyo(!!trigger.yoyo)
        .repeatDelay(trigger.repeatDelay ?? 0);

      scrollTrigger = ScrollTrigger.create({
        trigger: resolvedConfig.trigger,
        start: trigger.start,
        toggleActions: trigger.toggleActions,
        animation: timeline
      });
    }
  }

  /**
   * Disables the ScrollTrigger without removing it.
   */
  function disableTrigger() {
    if (scrollTrigger) {
      scrollTrigger.disable(false);
    }
  }

  /**
   * Enables a previously disabled ScrollTrigger.
   */
  function enableTrigger() {
    if (scrollTrigger) {
      scrollTrigger.enable();
    }
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
   * Cleans up the ScrollTrigger.
   */
  function destroy() {
    if (scrollTrigger) {
      scrollTrigger.kill();
      scrollTrigger = null;
    }
  }

  // No play/pause for scroll instances (controlled by scroll)
  function play() {
    // No-op for scroll instances
  }

  function pause() {
    // No-op for scroll instances
  }

  function onComplete(callback) {
    // No-op for scroll instances (timeline only)
  }

  return {
    type: 'scroll',
    disableTrigger,
    enableTrigger,
    seek,
    play,
    pause,
    onComplete,
    destroy,
    properties: {
      scrollTrigger // Expose scrollTrigger for external access if needed
    }
  };
}
