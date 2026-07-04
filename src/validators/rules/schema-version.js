/**
 * Rule: schema-version
 * Top-level guard.
 *
 * Requirements:
 * - schema.schemaVersion must be present and a positive integer.
 *
 * @param {unknown} schema
 * @param {string} path - Always "$"
 * @returns {ValidationError[]}
 */
export function schemaVersionRule(schema, path = "$") {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: "Project schema must be a valid JSON object.",
      path
    });
    return errors;
  }

  const { schemaVersion } = schema;

  if (schemaVersion === undefined || schemaVersion === null) {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: "schemaVersion is missing.",
      path
    });
  } else if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: `schemaVersion must be a positive integer, got ${JSON.stringify(schemaVersion)}.`,
      path
    });
  }

  return errors;
}
