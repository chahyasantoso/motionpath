/**
 * Rule: stop-sequence
 * Percent positions must be monotonic and unique. A missing 0% seed is an
 * authoring warning because the proxy starts from the merged 0% frame.
 */
export function stopSequenceRule(track, motion, context, path) {
  const errors = [];
  const keyframes = track?.keyframes;
  if (!keyframes || typeof keyframes !== 'object') return errors;

  for (const [key, config] of Object.entries(keyframes)) {
    const stops = config?.stops;
    if (!Array.isArray(stops) || stops.length === 0) continue;
    const propPath = `${path}.keyframes.${key}.stops`;
    let previous = -Infinity;
    const seen = new Map();
    stops.forEach((stop, index) => {
      if (!stop || typeof stop.p !== 'number') return;
      if (seen.has(stop.p)) {
        errors.push({ ruleId: 'stop-sequence', severity: 'error', message: `Duplicate stop position ${stop.p} for property "${key}".`, path: `${propPath}[${index}].p` });
      } else {
        seen.set(stop.p, index);
      }
      if (stop.p < previous) {
        errors.push({ ruleId: 'stop-sequence', severity: 'error', message: `Stop positions for property "${key}" must be monotonic.`, path: `${propPath}[${index}].p` });
      }
      previous = stop.p;
    });
    if (!stops.some((stop) => stop && stop.p === 0)) {
      errors.push({ ruleId: 'stop-sequence', severity: 'warning', message: `Property "${key}" has no p: 0 stop; its first frame may be undefined.`, path: propPath });
    }
    if (!stops.some((stop) => stop && stop.p === 1)) {
      errors.push({ ruleId: 'stop-sequence', severity: 'warning', message: `Property "${key}" has no p: 1 stop.`, path: propPath });
    }
  }
  return errors;
}
