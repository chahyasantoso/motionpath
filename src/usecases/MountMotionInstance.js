import { createMotionInstance } from '../domain/instance/index.js';

/**
 * MountMotionInstance use case.
 * Creates a motion instance using the functional factory pattern.
 * Normalizes driver type based on trigger configuration before routing.
 *
 * @param {string} motionId
 * @param {object} config
 * @param {object} schemaMotion
 * @param {object|Map} templates
 * @param {object} deps
 * @param {function} onSubscriberChange
 * @returns {object} Motion instance
 */
export function mountMotionInstance(motionId, config, schemaMotion, templates, deps, onSubscriberChange) {
  // Normalize driver type for correct behavior routing
  let driverType = schemaMotion.driver?.type || 'manual';
  if (driverType === 'timeline') {
    if (schemaMotion.driver?.trigger?.type === 'scroll') {
      driverType = 'gsap-scroll';
    } else {
      driverType = 'gsap-timeline';
    }
  }

  // Create normalized schema with updated driver type
  const normalizedSchema = {
    ...schemaMotion,
    driver: {
      ...schemaMotion.driver,
      type: driverType
    }
  };

  return createMotionInstance(motionId, config, normalizedSchema, templates, deps, onSubscriberChange);
}
