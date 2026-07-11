/**
 * Rule: element-uniqueness
 * * Project-wide element ID uniqueness check across ALL scenarios.
 * 
 * * Requirements:
 * - Collect every element ID across the entire project's scenarios.
 * - Any ID appearing in more than one scenario -> error (regardless of
 *   sceneId — the builder's elements map is flat and global, so any
 *   cross-scenario collision silently discards one tween. See the Pasar
 *   Malam lantern bug in .agent/lantern-animation-composition.md for the
 *   original real-world case this closes).
 * 
 * @param {unknown[]} scenarios
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(scenarios, context) {
  const errors = [];

  if (!Array.isArray(scenarios)) {
    return errors;
  }

  // Track locations of each element ID globally across all scenarios
  // elementId -> Array of { scenarioIndex, elementIndex }
  const idLocations = new Map();

  scenarios.forEach((scenario, scenarioIndex) => {
    if (!scenario || typeof scenario !== 'object') return;
    const elements = scenario.elements;
    if (!Array.isArray(elements)) return;

    elements.forEach((element, elementIndex) => {
      if (!element || typeof element !== 'object') return;
      const { id } = element;
      if (id !== undefined && id !== null && id !== '') {
        const eid = String(id);
        if (!idLocations.has(eid)) {
          idLocations.set(eid, []);
        }
        idLocations.get(eid).push({ scenarioIndex, elementIndex });
      }
    });
  });

  // Check for duplicates across the entire project
  idLocations.forEach((locations, eid) => {
    if (locations.length > 1) {
      locations.forEach(({ scenarioIndex, elementIndex }) => {
        errors.push({
          ruleId: "element-uniqueness",
          severity: "error",
          message: `Duplicate element ID '${eid}' found across multiple scenarios (scenario indices: ${locations.map(l => l.scenarioIndex).join(', ')}).`,
          path: `scenarios[${scenarioIndex}].elements[${elementIndex}].id`
        });
      });
    }
  });

  return errors;
}
