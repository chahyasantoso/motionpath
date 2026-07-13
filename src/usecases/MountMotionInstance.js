import {
  TimelineMotionInstance,
  ScrollMotionInstance,
  ManualMotionInstance
} from '../domain/MotionInstance.js';

/**
 * MountMotionInstance use case.
 * Determines the correct subclass of MotionInstance and instantiates it.
 *
 * @param {string} motionId
 * @param {object} config
 * @param {object} schemaMotion
 * @param {object|Map} templates
 * @param {object} deps
 * @param {function} onSubscriberChange
 * @returns {MotionInstance}
 */
export function mountMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
  let driverType = schemaMotion.driver?.type || 'manual';
  if (driverType === 'timeline') {
    if (schemaMotion.driver?.trigger?.type === 'scroll') {
      driverType = 'gsap-scroll';
    } else {
      driverType = 'gsap-timeline';
    }
  }

  switch (driverType) {
    case 'gsap-timeline':
      return new TimelineMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange);
    case 'gsap-scroll':
      return new ScrollMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange);
    case 'manual':
    case 'delegate':
      return new ManualMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange);
    default:
      throw new Error(`Unknown driver type: ${driverType}`);
  }
}
