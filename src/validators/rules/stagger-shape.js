/**
 * Rule: stagger-shape
 * Per-scenario stagger validation.
 *
 * Requirements:
 * - scenario.stagger present and negative -> error.
 * - scenario.stagger present, non-zero, and elements.length < 2 -> warning.
 *
 * @param {unknown} scenario
 * @param {string} path - JSON path to scenario
 * @returns {ValidationError[]}
 */
export function staggerShapeRule(scenario, path) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    return errors;
  }

  const stagger = scenario.stagger;
  if (stagger === undefined || stagger === null) {
    return errors;
  }

  const elements = scenario.elements || [];
  const staggerPath = `${path}.stagger`;

  let val = 0;
  let isNegative = false;

  if (typeof stagger === 'number') {
    val = stagger;
    isNegative = stagger < 0;
  } else if (stagger && typeof stagger === 'object') {
    const each = stagger.each;
    if (each !== undefined && each !== null && typeof each === 'number') {
      val = each;
      isNegative = each < 0;
    }
  }

  if (isNegative) {
    errors.push({
      ruleId: "stagger-shape",
      severity: "error",
      message: `scenario.stagger must not be negative. Got: ${JSON.stringify(stagger)}.`,
      path: staggerPath
    });
  } else if (val !== 0 && elements.length < 2) {
    errors.push({
      ruleId: "stagger-shape",
      severity: "warning",
      message: `scenario.stagger has no effect when scenario has fewer than 2 elements.`,
      path: staggerPath
    });
  }

  return errors;
}
