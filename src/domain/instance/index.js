import { createBaseInstance, buildTimeline, getCurrentSnapshot, destroyTimeline, seekChildren } from './base.js';
import { createSubscriberManager } from './subscribers.js';
import { createCompositionBehavior } from './composition.js';
import { createTimelineBehavior } from './timeline.js';
import { createScrollBehavior } from './scroll.js';
import { createManualBehavior } from './manual.js';

/**
 * Creates a motion instance with composed behavior based on driver type.
 * This replaces the old class-based MotionInstance hierarchy with functional composition.
 * 
 * @param {string} motionId - Motion ID from schema
 * @param {Object} config - Instance configuration
 * @param {Object} schemaMotion - Motion definition from schema
 * @param {Map} templates - Template map
 * @param {Object} deps - Dependencies (resolveElement, mountInstance)
 * @param {Function} onSubscriberChange - Callback when subscriber count changes
 * @returns {Object} Fully composed motion instance
 */
export function createMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
  // Create base instance data
  const base = createBaseInstance(motionId, config, schemaMotion, templates);
  
  let instance; // Forward reference for chicken-and-egg problem
  
  // Create subscriber manager
  const subscriberManager = createSubscriberManager((_, hasSubscribers) => {
    if (onSubscriberChange) {
      onSubscriberChange(instance, hasSubscribers);
    }
  });
  
  // Build timeline and tracks
  const { timeline } = buildTimeline(base, templates, () => {
    // Timeline update callback
    subscriberManager.broadcast(base, timeline);
    seekChildren(base, timeline);
  });
  
  // Create composition behavior (parent-child, stagger)
  const composition = createCompositionBehavior(base, timeline, deps);
  
  // Create driver-specific behavior
  const driverType = schemaMotion.driver?.type;
  let driverBehavior;
  
  switch (driverType) {
    case 'timeline':
    case 'gsap-timeline':
      driverBehavior = createTimelineBehavior(base, timeline, schemaMotion, config);
      break;
    case 'gsap-scroll':
    case 'scroll':
      driverBehavior = createScrollBehavior(base, timeline, schemaMotion, config, deps);
      break;
    case 'delegate':
    case 'manual':
    default:
      driverBehavior = createManualBehavior(base, timeline);
      break;
  }
  
  // Compose final instance object
  instance = {
    // Core identity
    id: base.id,
    motionId: base.motionId,
    config: base.config,
    tracks: schemaMotion.tracks || [],
    tracksMap: base.tracksMap,
    children: base.children,
    timeline,
    schemaMotion: base.schemaMotion,
    deps: base.deps,
    
    // Driver-specific properties
    ...driverBehavior.properties,
    
    // Core methods (composed from behaviors)
    seek: driverBehavior.seek,
    play: driverBehavior.play,
    pause: driverBehavior.pause,
    destroy: () => {
      driverBehavior.destroy();
      composition.destroyChildren();
      if (onSubscriberChange && base.tracksMap.size > 0) {
        onSubscriberChange(base, false);
      }
      destroyTimeline(base, timeline);
    },
    
    // Subscriber methods
    subscribe: (trackId, callback) => subscriberManager.subscribe(base, timeline, trackId, callback),
    compose: (trackId, rawData) => subscriberManager.compose(base, timeline, trackId, rawData),
    broadcast: () => subscriberManager.broadcast(base, timeline),
    
    // Composition methods
    addChild: composition.addChild,
    removeChild: composition.removeChild,
    onChildChange: composition.onChildChange,
    
    // Utility
    getCurrentSnapshot: (trackId) => getCurrentSnapshot(base, timeline, trackId)
  };
  
  return instance;
}

/**
 * Factory function for backward compatibility with old class-based API.
 * Creates a motion instance with the same interface as the old MotionInstance classes.
 * 
 * @param {string} motionId - Motion ID from schema
 * @param {Object} config - Instance configuration
 * @param {Object} schemaMotion - Motion definition from schema
 * @param {Map} templates - Template map
 * @param {Object} deps - Dependencies
 * @param {Function} onSubscriberChange - Subscriber change callback
 * @returns {Object} Motion instance
 */
export function mountMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
  return createMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange);
}