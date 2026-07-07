/**
 * Rule: timeline-group
 * Cross-scenario timeline grouping validation.
 *
 * Requirements:
 * - Group scenarios by timelineId.
 * - All scenarios in a group must have the identical trigger.type (and identical trigger.scrub if type is scroll) -> else error.
 * - No scenario in a group may have trigger.type === "scroll" && trigger.scrub === false (no observers) -> else error.
 * - Exactly one scenario per group must have primary === true -> else error.
 *
 * @param {unknown[]} scenarios
 * @returns {ValidationError[]}
 */
export function timelineGroupRule(scenarios, context) {
  const errors = [];

  if (!Array.isArray(scenarios)) {
    return errors;
  }

  // Group scenarios by timelineId (ignoring empty timelineId)
  const groups = new Map(); // timelineId -> Array of { scenario, index }

  scenarios.forEach((scenario, index) => {
    if (!scenario || typeof scenario !== 'object') return;
    const { timelineId } = scenario;
    if (timelineId !== undefined && timelineId !== null && timelineId !== '') {
      const tid = String(timelineId);
      if (!groups.has(tid)) {
        groups.set(tid, []);
      }
      groups.get(tid).push({ scenario, index });
    }
  });

  groups.forEach((list, timelineId) => {
    if (list.length === 0) return;

    // 1. Check identical trigger type and scrub
    const firstItem = list[0];
    const firstType = firstItem.scenario.trigger?.type;
    const firstScrub = firstItem.scenario.trigger?.scrub;

    list.forEach(({ scenario, index }) => {
      const trigger = scenario.trigger;
      const type = trigger?.type;
      const scrub = trigger?.scrub;

      if (type !== firstType || (type === 'scroll' && scrub !== firstScrub)) {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Scenario in timeline group '${timelineId}' has mismatching trigger. Expected type '${firstType}' and scrub '${firstScrub}', got type '${type}' and scrub '${scrub}'.`,
          path: `scenarios[${index}].trigger`
        });
      }
    });

    // 2. Check no observer (scroll and scrub: false)
    list.forEach(({ scenario, index }) => {
      const trigger = scenario.trigger;
      if (trigger?.type === 'scroll' && trigger?.scrub === false) {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Scenario in timeline group '${timelineId}' has an observer trigger (type: 'scroll', scrub: false), which cannot be grouped.`,
          path: `scenarios[${index}].trigger`
        });
      }
    });

    // 3. Exactly one primary === true
    const primaries = list.filter(({ scenario }) => scenario.primary === true);
    if (primaries.length !== 1) {
      list.forEach(({ index }) => {
        errors.push({
          ruleId: "timeline-group",
          severity: "error",
          message: `Timeline group '${timelineId}' must have exactly one primary scenario. Found ${primaries.length} primary scenario(s).`,
          path: `scenarios[${index}]`
        });
      });
    }

    // 4. Non-primary scenario must not declare start, end, pin, pinSpacing, snap, repeat, yoyo, repeatDelay
    const forbiddenFields = ['start', 'end', 'pin', 'pinSpacing', 'snap', 'repeat', 'yoyo', 'repeatDelay'];
    list.forEach(({ scenario, index }) => {
      if (scenario.primary !== true) {
        const trigger = scenario.trigger;
        if (trigger && typeof trigger === 'object') {
          forbiddenFields.forEach(field => {
            if (trigger[field] !== undefined && trigger[field] !== null) {
              errors.push({
                ruleId: "timeline-group",
                severity: "error",
                message: `Non-primary scenario in timeline group '${timelineId}' cannot declare trigger field '${field}'.`,
                path: `scenarios[${index}].trigger.${field}`
              });
            }
          });
        }
      }
    });
  });

  return errors;
}
