/**
 * Rule: path-shape
 * Validates the raw waypoint array authors provide for `path.points`.
 * `points` is NOT a pre-converted cubic Bézier array — pathPlugin.js converts
 * internally via convertToCubicPath() at build time. This rule validates the
 * input to that conversion, not its output.
 *
 * Also validates path.stops[].v range (0 <= v <= 1).
 * This check lives here because no other rule owns path.stops validation.
 *
 * @param {unknown} track
 * @param {unknown} motion
 * @param {{ schema: unknown }} context
 * @param {string} path - JSON path to track
 * @returns {ValidationError[]}
 */
export function pathShapeRule(track, motion, context, path) {
  const errors = [];
  const points = track?.keyframes?.path?.points;
  if (!Array.isArray(points)) return errors;

  const pointsPath = `${path}.keyframes.path.points`;

  if (points.length < 2) {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: "path.points needs at least 2 waypoints to form a path.",
      path: pointsPath,
    });
    return errors;
  }

  points.forEach((pt, i) => {
    const ptPath = `${pointsPath}[${i}]`;

    if (typeof pt?.x !== 'number' || typeof pt?.y !== 'number') {
      errors.push({
        ruleId: "path-shape",
        severity: "error",
        message: "each path point requires numeric x and y.",
        path: ptPath,
      });
    }

    const hasCtrlX = pt?.ctrlX !== undefined;
    const hasCtrlY = pt?.ctrlY !== undefined;
    if (hasCtrlX !== hasCtrlY) {
      errors.push({
        ruleId: "path-shape",
        severity: "error",
        message: "ctrlX and ctrlY must be provided together, or not at all.",
        path: ptPath,
      });
    }

    if (i === 0 && (hasCtrlX || hasCtrlY)) {
      errors.push({
        ruleId: "path-shape",
        severity: "warning",
        message: "ctrlX/ctrlY on the first path point have no effect (no preceding segment to curve).",
        path: ptPath,
      });
    }
  });

  // Validate stops[].v range (0 <= v <= 1).
  // This is the only rule that owns path.stops validation.
  const stops = track?.keyframes?.path?.stops;
  if (Array.isArray(stops)) {
    const stopsPath = `${path}.keyframes.path.stops`;
    stops.forEach((stop, idx) => {
      if (!stop || typeof stop !== 'object') return;
      const { v } = stop;
      if (v === undefined || v === null) return;
      if (typeof v !== 'number' || v < 0 || v > 1) {
        errors.push({
          ruleId: "path-shape",
          severity: "error",
          message: `path.stops[${idx}].v must satisfy 0 <= v <= 1. Got: ${JSON.stringify(v)}.`,
          path: `${stopsPath}[${idx}].v`,
        });
      }
    });
  }

  return errors;
}
