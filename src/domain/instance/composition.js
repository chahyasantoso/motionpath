import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Creates composition behavior for parent-child instance relationships.
 * Handles addChild, removeChild, and child change listeners with stagger logic.
 * 
 * @param {Object} base - Base instance data
 * @param {Object} timeline - Parent timeline
 * @param {Object} deps - Dependencies (mountInstance function)
 * @returns {Object} Composition behavior functions
 */
export function createCompositionBehavior(base, timeline, deps) {
  
  /**
   * Registers a callback for child change events.
   * 
   * @param {Function} callback - Callback to invoke when children change
   * @returns {Function} Cleanup function to remove listener
   */
  function onChildChange(callback) {
    base.childListeners.add(callback);
    return () => base.childListeners.delete(callback);
  }

  /**
   * Adds a child instance to this parent with automatic stagger calculation.
   * 
   * @param {string|Object} motionIdOrConfig - Child motion ID or config object
   * @param {Object} config - Additional config (if first param is motion ID)
   * @returns {Object} Child instance
   */
  function addChild(motionIdOrConfig, config) {
    let targetMotionId = base.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
      targetMotionId = motionIdOrConfig;
      targetConfig = config || {};
    } else if (typeof motionIdOrConfig === 'object') {
      targetConfig = motionIdOrConfig;
    }

    const stagger = base.schemaMotion.stagger ?? base.schemaMotion.driver?.stagger ?? 0;
    const childIndex = base.children.length;
    const calculatedDelay = targetConfig.delay ?? (childIndex * stagger);

    const child = deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: base.id
    });

    child.currentDelay = calculatedDelay;
    base.children.push(child);

    // Pad parent timeline duration to encompass child animations
    const childDuration = child.timeline.duration() || 1.0;
    const childEndTime = calculatedDelay + childDuration;
    const paddingCb = () => {};
    child.paddingCallback = paddingCb;
    timeline.add(paddingCb, childEndTime);

    // Notify child change listeners before refreshing ScrollTriggers
    base.childListeners.forEach(cb => cb());

    // Refresh ScrollTriggers to update the scroll heights and pinning markers
    if (typeof window !== 'undefined' && ScrollTrigger) {
      ScrollTrigger.refresh();
    }

    return child;
  }

  /**
   * Removes a child instance and smoothly animates remaining children's delays.
   * 
   * @param {Object} child - Child instance to remove
   */
  function removeChild(child) {
    const idx = base.children.indexOf(child);
    if (idx !== -1) {
      base.children.splice(idx, 1);
      if (child.paddingCallback) {
        timeline.remove(child.paddingCallback);
      }
      child.destroy();

      // Smoothly animate currentDelay for remaining children using GSAP
      const stagger = base.schemaMotion.stagger ?? base.schemaMotion.driver?.stagger ?? 0;
      base.children.forEach((c, newIdx) => {
        const newDelay = newIdx * stagger;
        if (c.currentDelay === undefined) {
          c.currentDelay = c.config.delay || 0;
        }
        if (c.delayTween) c.delayTween.kill();
        c.delayTween = gsap.to(c, {
          currentDelay: newDelay,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            const parentTime = timeline.time();
            const childDuration = c.timeline.duration() || 1.0;
            const childTime = parentTime - c.currentDelay;
            const childProgress = Math.max(0, Math.min(1, childTime / childDuration));
            c.seek(childProgress);
          }
        });
      });

      // Notify child change listeners before refreshing ScrollTriggers
      base.childListeners.forEach(cb => cb());

      // Refresh ScrollTriggers to update the scroll heights and pinning markers
      if (typeof window !== 'undefined' && ScrollTrigger) {
        ScrollTrigger.refresh();
      }
    }
  }

  /**
   * Destroys all children and cleans up.
   */
  function destroyChildren() {
    base.children.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    base.children.length = 0;
  }

  return {
    onChildChange,
    addChild,
    removeChild,
    destroyChildren
  };
}
