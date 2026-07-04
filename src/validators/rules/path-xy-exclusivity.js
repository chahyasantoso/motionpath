/**
 * Rule: path-xy-exclusivity
 * Per-element keyframes mutual exclusivity checking between path and x/y.
 *
 * Requirements:
 * - keyframes.path and (keyframes.x or keyframes.y) both present on the same element -> error.
 *
 * @param {unknown} element
 * @param {unknown} scenario - Parent scenario
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
export function pathXYExclusivityRule(element, scenario, path) {
  const errors = [];

  if (!element || typeof element !== 'object') {
    return errors;
  }

  const keyframes = element.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  const hasPath = keyframes.path !== undefined && keyframes.path !== null;
  const hasX = keyframes.x !== undefined && keyframes.x !== null;
  const hasY = keyframes.y !== undefined && keyframes.y !== null;

  if (hasPath && (hasX || hasY)) {
    const offendingProps = [hasX ? 'x' : '', hasY ? 'y' : ''].filter(Boolean).join('/');
    errors.push({
      ruleId: "path-xy-exclusivity",
      severity: "error",
      message: `Element has both a 'path' property and explicit '${offendingProps}' keyframes. They are mutually exclusive.`,
      path: `${path}.keyframes`
    });
  }

  return errors;
}
