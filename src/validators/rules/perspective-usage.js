/**
 * Rule: perspective-usage
 * Per-scenario warning check for perspective.
 *
 * Requirements:
 * - If any element in the scenario uses z, rotationX, or rotationY,
 *   and top-level schema.perspective is absent -> warning.
 *
 * @param {unknown} scenario
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to scenario
 * @returns {ValidationError[]}
 */
export function perspectiveUsageRule(scenario, context, path) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    return errors;
  }

  const schemaPerspective = context?.schema?.perspective;
  // Perspective is present if it's not null/undefined
  const isPerspectivePresent = schemaPerspective !== undefined && schemaPerspective !== null;
  if (isPerspectivePresent) {
    return errors; // perspective is set, no warnings needed
  }

  const elements = scenario.elements;
  if (!Array.isArray(elements)) {
    return errors;
  }

  let uses3D = false;

  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    const keyframes = element.keyframes;
    if (!keyframes || typeof keyframes !== 'object') continue;

    const hasZ = keyframes.z !== undefined && keyframes.z !== null;
    const hasRotX = keyframes.rotationX !== undefined && keyframes.rotationX !== null;
    const hasRotY = keyframes.rotationY !== undefined && keyframes.rotationY !== null;

    let hasPathZ = false;
    if (keyframes.path && typeof keyframes.path === 'object' && Array.isArray(keyframes.path.points)) {
      hasPathZ = keyframes.path.points.some(pt => pt && pt.z !== undefined && pt.z !== null && pt.z !== 0);
    }

    if (hasZ || hasRotX || hasRotY || hasPathZ) {
      uses3D = true;
      break;
    }
  }

  if (uses3D) {
    errors.push({
      ruleId: "perspective-usage",
      severity: "warning",
      message: `Scenario contains 3D keyframe properties (z, rotationX, or rotationY), but top-level 'perspective' is missing.`,
      path
    });
  }

  return errors;
}
