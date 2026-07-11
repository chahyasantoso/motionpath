/**
 * Rule: ease-collision
 * Per-motion ease collision validation.
 *
 * Requirements:
 * - For every pair of distinct keyframe properties on the same track,
 *   if two stops entries share the same literal p value but different ease values -> error.
 *
 * @param {unknown} motion
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to motion
 * @returns {ValidationError[]}
 */
export function easeCollisionRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== 'object') {
    return errors;
  }

  const tracks = motion.tracks;
  if (!Array.isArray(tracks)) {
    return errors;
  }

  tracks.forEach((track, i) => {
    if (!track || typeof track !== 'object') return;
    const trackPath = `${path}.tracks[${i}]`;
    const keyframes = track.keyframes;
    if (!keyframes || typeof keyframes !== 'object') return;

    // Group stops by progress p
    // pKey -> Map(ease -> Array of propKeys)
    const stopsByP = new Map();

    Object.entries(keyframes).forEach(([propKey, value]) => {
      if (!value || typeof value !== 'object') return;
      
      // Determine the stops array.
      // If it's a 'path' property, the stops are under keyframes.path.stops.
      // Otherwise they are under keyframes[propKey].stops.
      const stops = value.stops;
      if (!Array.isArray(stops)) return;

      stops.forEach(stop => {
        if (!stop || typeof stop !== 'object') return;
        const { p, ease } = stop;
        if (p === undefined || p === null) return;
        if (ease === undefined || ease === null || ease === '') return;

        // Use exact number as key (we can stringify it)
        const pKey = String(p);
        if (!stopsByP.has(pKey)) {
          stopsByP.set(pKey, new Map());
        }

        const easeMap = stopsByP.get(pKey);
        if (!easeMap.has(ease)) {
          easeMap.set(ease, []);
        }
        easeMap.get(ease).push(propKey);
      });
    });

    // Check for collisions at each p
    stopsByP.forEach((easeMap, pKey) => {
      if (easeMap.size > 1) {
        // Collect detail for the error message
        const conflictDetails = [];
        easeMap.forEach((props, ease) => {
          conflictDetails.push(`'${props.join(', ')}' wants '${ease}'`);
        });

        errors.push({
          ruleId: "ease-collision",
          severity: "error",
          message: `Track '${track.id || i}' has conflicting eases at p=${pKey}: ${conflictDetails.join(', ')}.`,
          path: `${trackPath}.keyframes`
        });
      }
    });
  });

  return errors;
}
