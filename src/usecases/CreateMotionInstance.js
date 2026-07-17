import { MotionInstance } from '../domain/instance/MotionInstance.js';
import { getMotion } from '../domain/models.js';

/**
 * CreateMotionInstance use case.
 * Creates a motion instance using the functional factory pattern.
 * Normalizes driver type based on trigger configuration before routing.
 *
 * @param {string} motionId
 * @param {object} config
 * @param {object} context
 * @returns {object} Motion instance
 */
export function createMotionInstance(motionId, config, context) {
  const schemaMotion = getMotion(context.project, motionId);
  if (!schemaMotion) {
    throw new Error(`createMotionInstance: motion with id "${motionId}" not found.`);
  }

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

  const instance = new MotionInstance(motionId, config, normalizedSchema, context);

  const originalDestroy = instance.destroy.bind(instance);
  let destroyed = false;
  instance.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    originalDestroy();
    if (context && typeof context.onDestroy === 'function') {
      context.onDestroy(instance);
    }
  };

  return instance;
}
