/**
 * Rule: trigger-shape
 * Per-scenario trigger validation.
 *
 * Requirements:
 * - scenario.trigger.type must be exactly one of "scroll", "time".
 * - If type === "scroll": scrub must be boolean, present.
 * - endTrigger present + NOT (type === "scroll" && scrub === true) -> error.
 * - repeat, yoyo, or repeatDelay present + (type === "scroll" && scrub === true) -> error.
 * - delay present + (type === "scroll" && scrub === true) -> error.
 *
 * @param {unknown} scenario
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to the scenario, e.g. "scenarios[0]"
 * @returns {ValidationError[]}
 */
export function triggerShapeRule(scenario, context, path) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    return errors; // handled by top-level or orchestrator checks, don't crash
  }

  const trigger = scenario.trigger;
  const triggerPath = `${path}.trigger`;

  if (trigger === undefined || trigger === null) {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "scenario.trigger is required.",
      path: triggerPath
    });
    return errors;
  }

  if (typeof trigger !== 'object') {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: "scenario.trigger must be an object.",
      path: triggerPath
    });
    return errors;
  }

  const { type, scrub, endTrigger, repeat, yoyo, repeatDelay, delay } = trigger;

  if (type !== 'scroll' && type !== 'time') {
    errors.push({
      ruleId: "trigger-shape",
      severity: "error",
      message: `trigger.type must be exactly one of 'scroll', 'time'. Got: ${JSON.stringify(type)}.`,
      path: `${triggerPath}.type`
    });
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

  // element duration present + (type === "scroll" && scrub === true) -> error.
  if (isScrub && Array.isArray(scenario.elements)) {
    scenario.elements.forEach((element, idx) => {
      if (element && element.duration !== undefined && element.duration !== null) {
        errors.push({
          ruleId: "trigger-shape",
          severity: "error",
          message: `duration is incompatible with scroll-scrub triggers (found on element '${element.id || 'unknown'}').`,
          path: `${path}.elements[${idx}].duration`
        });
      }
    });
  }

  return errors;
}
