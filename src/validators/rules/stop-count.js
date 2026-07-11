/**
 * Rule: stop-count
 * Verifies that any animated property (including `path.stops`) has at least 2 stops.
 *
 * @param {unknown} element
 * @param {unknown} scenario - Parent scenario
 * @param {unknown} context - Global context
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
export function stopCountRule(element, scenario, context, path) {
  const errors = [];

  if (!element || typeof element !== 'object') {
    return errors;
  }

  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  Object.entries(keyframes).forEach(([propKey, value]) => {
    if (!value || typeof value !== 'object') return;
    const stops = value.stops;
    if (!Array.isArray(stops) || stops.length < 2) {
      errors.push({
        ruleId: "stop-count",
        severity: "error",
        message: `Property '${propKey}' on element '${element.id || 'unknown'}' must have at least 2 stops, but got ${Array.isArray(stops) ? stops.length : 0}.`,
        path: `${path}.keyframes.${propKey}`
      });
    }
  });

  return errors;
}
