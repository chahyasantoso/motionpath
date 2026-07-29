/**
 * Rule: stop-count
 * Verifies that any animated property (including `path.stops`) has at least 2 stops.
 *
 * @param {unknown} track
 * @param {unknown} motion - Parent motion
 * @param {unknown} context - Global context
 * @param {string} path - JSON path to track
 * @returns {ValidationError[]}
 */
export function stopCountRule(track, motion, context, path) {
  const errors = [];

  if (!track || typeof track !== "object") {
    return errors;
  }

  const keyframes = track.keyframes;
  if (!keyframes || typeof keyframes !== "object") {
    return errors;
  }

  Object.entries(keyframes).forEach(([propKey, value]) => {
    if (!value || typeof value !== "object") return;
    const stops = value.stops;
    if (!Array.isArray(stops) || stops.length < 2) {
      errors.push({
        ruleId: "stop-count",
        severity: "error",
        message: `Property '${propKey}' on track '${track.id || "unknown"}' must have at least 2 stops, but got ${Array.isArray(stops) ? stops.length : 0}.`,
        path: `${path}.keyframes.${propKey}`,
      });
    }
  });

  return errors;
}
