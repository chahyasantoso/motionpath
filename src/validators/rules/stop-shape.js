/**
 * Rule: stop-shape
 * Verifies that each entry in a keyframe's `stops` is a plain object with:
 * - `p`: number in range 0-1
 * - `v`: defined (not undefined/null)
 *
 * @param {unknown} track
 * @param {unknown} motion - Parent motion
 * @param {unknown} context - Global context
 * @param {string} path - JSON path to track
 * @returns {ValidationError[]}
 */
export function stopShapeRule(track, motion, context, path) {
  const errors = [];

  if (!track || typeof track !== 'object') {
    return errors;
  }

  const keyframes = track.keyframes;
  if (!keyframes || typeof keyframes !== 'object') {
    return errors;
  }

  Object.entries(keyframes).forEach(([propKey, value]) => {
    if (!value || typeof value !== 'object') return;
    const stops = value.stops;
    if (!Array.isArray(stops)) return;

    const propPath = `${path}.keyframes.${propKey}`;

    stops.forEach((stop, idx) => {
      const stopPath = `${propPath}.stops[${idx}]`;

      if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
        errors.push({
          ruleId: "stop-shape",
          severity: "error",
          message: `Stop at index ${idx} for property '${propKey}' on track '${track.id || 'unknown'}' must be a plain object. Got: ${JSON.stringify(stop)}.`,
          path: stopPath
        });
        return;
      }

      const { p, v } = stop;

      if (p === undefined || p === null) {
        errors.push({
          ruleId: "stop-shape",
          severity: "error",
          message: `Stop at index ${idx} for property '${propKey}' on track '${track.id || 'unknown'}' is missing required property 'p'.`,
          path: `${stopPath}.p`
        });
      } else if (typeof p !== 'number' || p < 0 || p > 1) {
        errors.push({
          ruleId: "stop-shape",
          severity: "error",
          message: `Stop at index ${idx} for property '${propKey}' on track '${track.id || 'unknown'}' must have 'p' as a number between 0 and 1. Got: ${JSON.stringify(p)}.`,
          path: `${stopPath}.p`
        });
      }

      if (v === undefined || v === null) {
        errors.push({
          ruleId: "stop-shape",
          severity: "error",
          message: `Stop at index ${idx} for property '${propKey}' on track '${track.id || 'unknown'}' must have a defined 'v' value. Got: ${JSON.stringify(v)}.`,
          path: `${stopPath}.v`
        });
      }
    });
  });

  return errors;
}
