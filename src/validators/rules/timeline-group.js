/**
 * Rule: timeline-group
 * Cross-motion timeline grouping validation.
 *
 * Requirements:
 * - Group motions by driver.timelineId.
 * - All motions in a group must have the identical driver.trigger.type (and identical driver.trigger.scrub if type is scroll) -> else error.
 * - No motion in a group may have driver.trigger.type === "scroll" && driver.trigger.scrub === false (no observers) -> else error.
 * - Exactly one motion per group must have driver.primary === true -> else error.
 *
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
export function timelineGroupRule(motions, context) {
  const errors = [];

  if (!Array.isArray(motions)) {
    return errors;
  }

  // Group motions by timelineId (ignoring empty timelineId)
  const groups = new Map(); // timelineId -> Array of { motion, index }

  motions.forEach((motion, index) => {
    if (!motion || typeof motion !== 'object') return;
    const { driver } = motion;
    const timelineId = driver?.timelineId;
    if (timelineId !== undefined && timelineId !== null && timelineId !== '') {
      const tid = String(timelineId);
      if (!groups.has(tid)) {
        groups.set(tid, []);
      }
      groups.get(tid).push({ motion, index });
    }
  });

  groups.forEach((list, timelineId) => {
    if (list.length === 0) return;

    // 1. Check identical trigger type and scrub
    const firstItem = list[0];
    const firstType = firstItem.motion.driver?.trigger?.type;
    const firstScrub = firstItem.motion.driver?.trigger?.scrub;

    list.forEach(({ motion, index }) => {
      const trigger = motion.driver?.trigger;
      const type = trigger?.type;
      const scrub = trigger?.scrub;

      if (type !== firstType || (type === 'scroll' && scrub !== firstScrub)) {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Motion in timeline group '${timelineId}' has mismatching trigger. Expected type '${firstType}' and scrub '${firstScrub}', got type '${type}' and scrub '${scrub}'.`,
          path: `motions[${index}].driver.trigger`
        });
      }
    });

    // 2. Check no observer (scroll and scrub: false)
    list.forEach(({ motion, index }) => {
      const trigger = motion.driver?.trigger;
      if (trigger?.type === 'scroll' && trigger?.scrub === false) {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Motion in timeline group '${timelineId}' has an observer trigger (type: 'scroll', scrub: false), which cannot be grouped.`,
          path: `motions[${index}].driver.trigger`
        });
      }
    });

    // 3. Exactly one primary === true
    const primaries = list.filter(({ motion }) => motion.driver?.primary === true);
    if (primaries.length !== 1) {
      list.forEach(({ index }) => {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Timeline group '${timelineId}' must have exactly one primary motion. Found ${primaries.length} primary motion(s).`,
          path: `motions[${index}]`
        });
      });
    }

    // 4. Non-primary motion must not declare start, end, pin, pinSpacing, snap, repeat, yoyo, repeatDelay
    const forbiddenFields = ['start', 'end', 'pin', 'pinSpacing', 'snap', 'repeat', 'yoyo', 'repeatDelay'];
    list.forEach(({ motion, index }) => {
      if (motion.driver?.primary !== true) {
        const trigger = motion.driver?.trigger;
        if (trigger && typeof trigger === 'object') {
          forbiddenFields.forEach(field => {
            if (trigger[field] !== undefined && trigger[field] !== null) {
              errors.push({
                ruleId: "timeline-group",
                severity: "error",
                message: `Non-primary motion in timeline group '${timelineId}' cannot declare trigger field '${field}'.`,
                path: `motions[${index}].driver.trigger.${field}`
              });
            }
          });
        }
      }
    });
  });

  return errors;
}
