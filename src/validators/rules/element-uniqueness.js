/**
 * Rule: element-uniqueness
 * Cross-scenario element ID uniqueness check within the same sceneId.
 *
 * Requirements:
 * - Group scenarios by sceneId.
 * - Within each group, collect all element IDs across all scenarios sharing that sceneId.
 * - Any ID appearing more than once within that group -> error.
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
