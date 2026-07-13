/**
 * Rule: stagger-shape
 * Per-motion stagger validation.
 *
 * Requirements:
 * - motion.stagger present and negative -> error.
 * - motion.stagger present, non-zero, and tracks.length < 2 -> warning.
 *
 * @param {unknown} motion
 * @param {{ schema: unknown }} context - Rule validation context
 * @param {string} path - JSON path to motion
 * @returns {ValidationError[]}
 */
export function staggerShapeRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== 'object') {
    return errors;
  }

  if (motion.driver?.type === 'delegate') {
    return errors;
  }

  const stagger = motion.stagger;
  if (stagger === undefined || stagger === null) {
    return errors;
  }

  const tracks = motion.tracks || [];
  const staggerPath = `${path}.stagger`;

  if (typeof stagger !== 'number') {
    errors.push({
      ruleId: "stagger-shape",
      severity: "error",
      message: "motion.stagger must be a plain number. Object-form stagger (e.g. { each, amount, from }) is not supported.",
      path: staggerPath
    });
    return errors;
  }

  const val = stagger;
  const isNegative = stagger < 0;

  if (isNegative) {
    errors.push({
      ruleId: "stagger-shape",
      severity: "error",
      message: `motion.stagger must not be negative. Got: ${JSON.stringify(stagger)}.`,
      path: staggerPath
    });
  }

  return errors;
}
