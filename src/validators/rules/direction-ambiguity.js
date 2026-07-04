/**
 * Rule: direction-ambiguity
 * Per-element direction validation for keyframe properties.
 *
 * Requirements:
 * - 2+ stops -> direction ignored, never an error regardless of value.
 * - 1 stop, p ≈ 0 (within epsilon 0.001), direction omitted -> no error.
 * - 1 stop, p ≈ 1, direction omitted -> no error.
 * - 1 stop, p elsewhere, direction omitted -> error.
 * - 1 stop, direction === "fromTo" -> error (needs 2 stops).
 *
 * @param {unknown} element
 * @param {unknown} scenario - Parent scenario
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
export function directionAmbiguityRule(element, scenario, path) {
  const errors = [];

  if (!element || typeof element !== 'object') {
    return errors;
  }

  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  const direction = element.direction;

  Object.entries(keyframes).forEach(([propKey, value]) => {
    if (!value || typeof value !== 'object') return;
    const stops = value.stops;
    if (!Array.isArray(stops)) return;

    if (stops.length === 1) {
      const stop = stops[0];
      if (!stop || typeof stop !== 'object') return;

      const p = stop.p;
      if (p === undefined || p === null) return;

      const near0 = Math.abs(p - 0) < 0.001;
      const near1 = Math.abs(p - 1) < 0.001;

      if (direction === 'fromTo') {
        errors.push({
          ruleId: "direction-ambiguity",
          severity: "error",
          message: `Element direction 'fromTo' requires at least 2 stops, but property '${propKey}' has only 1 stop.`,
          path: `${path}.keyframes.${propKey}`
        });
      } else if (direction === undefined || direction === null) {
        if (!near0 && !near1) {
          errors.push({
            ruleId: "direction-ambiguity",
            severity: "error",
            message: `Property '${propKey}' has a single stop at p=${p} (not near 0 or 1), so element direction is required.`,
            path: `${path}.keyframes.${propKey}`
          });
        }
      }
    }
  });

  return errors;
}
