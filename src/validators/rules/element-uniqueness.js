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

  // Group scenarios by sceneId (ignoring empty sceneId)
  const groups = new Map(); // sceneId -> Array of { scenario, index }

  scenarios.forEach((scenario, index) => {
    if (!scenario || typeof scenario !== 'object') return;
    const { sceneId } = scenario;
    if (sceneId !== undefined && sceneId !== null && sceneId !== '') {
      const sid = String(sceneId);
      if (!groups.has(sid)) {
        groups.set(sid, []);
      }
      groups.get(sid).push({ scenario, index });
    }
  });

  groups.forEach((list, sceneId) => {
    if (list.length === 0) return;

    // Track locations of each element ID
    // elementId -> Array of { scenarioIndex, elementIndex }
    const idLocations = new Map();

    list.forEach(({ scenario, index: scenarioIndex }) => {
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

    // Check for duplicates
    idLocations.forEach((locations, eid) => {
      if (locations.length > 1) {
        locations.forEach(({ scenarioIndex, elementIndex }) => {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate element ID '${eid}' found within scene '${sceneId}' (referenced in multiple scenarios or multiple times).`,
            path: `scenarios[${scenarioIndex}].elements[${elementIndex}].id`
          });
        });
      }
    });
  });

  return errors;
}
