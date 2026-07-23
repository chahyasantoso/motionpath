import { triggerDelegateRegistry } from '../../lib/TriggerDelegate.js';

/**
 * Rule: trigger-shape
 * Per-motion trigger validation.
 * Supports both v4 (motion.trigger) and v3 (motion.driver.trigger) shapes.
 *
 * @param {unknown} motion
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to the motion, e.g. "motions[0]"
 * @returns {ValidationError[]}
 */
export function triggerShapeRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== 'object') {
    return errors; // handled by top-level or orchestrator checks, don't crash
  }

  // Skip validation for delegate motions (delegate forbids trigger entirely, handled by driver rule)
  if (motion.driver?.type === 'delegate') {
    return errors;
  }

  const isV4Trigger = motion.trigger !== undefined;
  const trigger = motion.trigger ?? motion.driver?.trigger;
  const triggerPath = isV4Trigger ? `${path}.trigger` : `${path}.driver.trigger`;

  if (trigger === undefined || trigger === null) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "motion trigger is required.",
      path: triggerPath
    });
    return errors;
  }

  if (typeof trigger !== 'object') {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "motion trigger must be an object.",
      path: triggerPath
    });
    return errors;
  }

  const { type, scrub, endTrigger, repeat, yoyo, repeatDelay, delay } = trigger;

  if (!type || typeof type !== 'string') {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: `trigger.type is required.`,
      path: `${triggerPath}.type`
    });
    return errors;
  }

  // Allow custom registered trigger types or built-in 'scroll' | 'time' | 'manual'
  if (type !== 'scroll' && type !== 'time' && type !== 'manual' && !triggerDelegateRegistry.has(type)) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: `trigger.type must be a registered trigger type ('scroll', 'time', 'manual', etc.). Got: ${JSON.stringify(type)}.`,
      path: `${triggerPath}.type`
    });
    return errors;
  }

  if (type === 'manual') {
    return errors;
  }

  if (type === 'scroll') {
    if (scrub === undefined || scrub === null) {
      errors.push({
        ruleId: "trigger-shape",
        severity: "error",
        message: "scroll trigger requires 'scrub' parameter.",
        path: `${triggerPath}.scrub`
      });
    } else if (typeof scrub !== 'boolean' && typeof scrub !== 'number') {
      errors.push({
        ruleId: "trigger-shape",
        severity: "error",
        message: "scroll trigger 'scrub' parameter must be a boolean or a number.",
        path: `${triggerPath}.scrub`
      });
    }
  }

  const isScrub = type === 'scroll' && (scrub === true || typeof scrub === 'number');

  // endTrigger present + NOT (type === "scroll" && scrub === true) -> error.
  if (endTrigger !== undefined && endTrigger !== null && !isScrub) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "endTrigger is only valid on scroll triggers with scrub:true.",
      path: `${triggerPath}.endTrigger`
    });
  }

  // repeat, yoyo, repeatDelay present + (type === "scroll" && scrub === true) -> error.
  const hasRepeat = repeat !== undefined && repeat !== null;
  const hasYoyo = yoyo !== undefined && yoyo !== null;
  const hasRepeatDelay = repeatDelay !== undefined && repeatDelay !== null;

  if (isScrub && (hasRepeat || hasYoyo || hasRepeatDelay)) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "repeat, yoyo, and repeatDelay are incompatible with scroll-scrub triggers.",
      path: triggerPath
    });
  }

  // delay present + (type === "scroll" && scrub === true) -> error.
  if (isScrub && delay !== undefined && delay !== null) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "delay is incompatible with scroll-scrub triggers.",
      path: `${triggerPath}.delay`
    });
  }

  // track duration present + (type === "scroll" && scrub === true) -> error.
  if (isScrub && Array.isArray(motion.tracks)) {
    motion.tracks.forEach((track, idx) => {
      if (track && track.duration !== undefined && track.duration !== null) {
        errors.push({
          ruleId: "trigger-shape",
          severity: "error",
          message: `duration is incompatible with scroll-scrub triggers (found on track '${track.id || 'unknown'}').`,
          path: `${path}.tracks[${idx}].duration`
        });
      }
    });
  }

  return errors;
}
