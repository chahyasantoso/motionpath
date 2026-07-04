/**
 * Rule: path-shape
 * Per-element Bézier path and stops range check.
 *
 * Requirements:
 * - Only runs if keyframes.path is present.
 * - path.points.length >= 4 and (points.length - 1) % 3 === 0 -> else error (invalid Bézier chain).
 * - Every path.stops[].v must satisfy 0 <= v <= 1 -> else error.
 *
 * @param {unknown} element
 * @param {unknown} scenario - Parent scenario
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
export function pathShapeRule(element, scenario, path) {
  const errors = [];

  if (!element || typeof element !== 'object') {
    return errors;
  }

  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  const pathVal = keyframes.path;
  if (pathVal === undefined || pathVal === null) {
    return errors;
  }

  const pathPath = `${path}.keyframes.path`;

  if (typeof pathVal !== 'object') {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: "keyframes.path must be an object.",
      path: pathPath
    });
    return errors;
  }

  const { points, stops } = pathVal;

  // Validate points array
  if (points === undefined || points === null) {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: "path.points is required when using path keyframes.",
      path: `${pathPath}.points`
    });
  } else if (!Array.isArray(points)) {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: "path.points must be an array.",
      path: `${pathPath}.points`
    });
  } else if (points.length < 4 || (points.length - 1) % 3 !== 0) {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: `path.points.length must be >= 4 and satisfy (length - 1) % 3 === 0 for a cubic Bézier chain. Got: ${points.length}.`,
      path: `${pathPath}.points`
    });
  }

  // Validate stops array range for v
  if (stops !== undefined && stops !== null) {
    if (!Array.isArray(stops)) {
      errors.push({
        ruleId: "path-shape",
        severity: "error",
        message: "path.stops must be an array.",
        path: `${pathPath}.stops`
      });
    } else {
      stops.forEach((stop, idx) => {
        if (!stop || typeof stop !== 'object') return;
        const { v } = stop;
        if (v === undefined || v === null) return;
        if (typeof v !== 'number' || v < 0 || v > 1) {
          errors.push({
            ruleId: "path-shape",
            severity: "error",
            message: `path.stops[${idx}].v must satisfy 0 <= v <= 1. Got: ${JSON.stringify(v)}.`,
            path: `${pathPath}.stops[${idx}].v`
          });
        }
      });
    }
  }

  return errors;
}
