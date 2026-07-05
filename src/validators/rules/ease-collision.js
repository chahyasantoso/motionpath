/**
 * Rule: ease-collision
 * Per-scenario ease collision validation.
 *
 * Requirements:
 * - For every pair of distinct keyframe properties on the same element,
 *   if two stops entries share the same literal p value but different ease values -> error.
 *
 * @param {unknown} scenario
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to scenario
 * @returns {ValidationError[]}
 */
export function easeCollisionRule(scenario, context, path) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    return errors;
  }

  const elements = scenario.elements;
  if (!Array.isArray(elements)) {
    return errors;
  }

  elements.forEach((element, i) => {
    if (!element || typeof element !== 'object') return;
    const elementPath = `${path}.elements[${i}]`;
    const keyframes = element.keyframes;
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
          message: `Element '${element.id || i}' has conflicting eases at p=${pKey}: ${conflictDetails.join(', ')}.`,
          path: `${elementPath}.keyframes`
        });
      }
    });
  });

  return errors;
}
