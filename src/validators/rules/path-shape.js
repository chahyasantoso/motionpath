export function pathShapeRule(track, motion, context, path) {
  const errors = [];
  const pathConfig = track?.keyframes?.path;
  const points = pathConfig?.points;
  if (!Array.isArray(points)) return errors;
  const pointsPath = `${path}.keyframes.path.points`;
  const anchor = pathConfig.anchor;
  if (anchor !== undefined && anchor !== 'center' && anchor !== 'none' && (!anchor || typeof anchor !== 'object' || typeof anchor.xPercent !== 'number' || typeof anchor.yPercent !== 'number')) {
    errors.push({ ruleId: 'path-shape', severity: 'error', message: 'path.anchor must be "center", "none", or an object with numeric xPercent and yPercent.', path: `${path}.keyframes.path.anchor` });
  }
  if (points.length < 2) {
    errors.push({ ruleId: 'path-shape', severity: 'error', message: 'path.points needs at least 2 waypoints to form a path.', path: pointsPath });
    return errors;
  }
  points.forEach((point, index) => {
    const pointPath = `${pointsPath}[${index}]`;
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') errors.push({ ruleId: 'path-shape', severity: 'error', message: 'each path point requires numeric x and y.', path: pointPath });
    const hasCtrlX = point?.ctrlX !== undefined;
    const hasCtrlY = point?.ctrlY !== undefined;
    if (hasCtrlX !== hasCtrlY) errors.push({ ruleId: 'path-shape', severity: 'error', message: 'ctrlX and ctrlY must be provided together, or not at all.', path: pointPath });
    if (index === 0 && (hasCtrlX || hasCtrlY)) errors.push({ ruleId: 'path-shape', severity: 'warning', message: 'ctrlX/ctrlY on the first path point have no effect (no preceding segment to curve).', path: pointPath });
  });
  const stops = pathConfig.stops;
  if (Array.isArray(stops)) stops.forEach((stop, index) => {
    const value = stop?.v;
    if (value !== undefined && value !== null && (typeof value !== 'number' || value < 0 || value > 1)) errors.push({ ruleId: 'path-shape', severity: 'error', message: `path.stops[${index}].v must satisfy 0 <= v <= 1. Got: ${JSON.stringify(value)}.`, path: `${path}.keyframes.path.stops[${index}].v` });
  });
  return errors;
}
