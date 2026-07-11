export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Rule: schema-version
 * Top-level guard.
 *
 * Requirements:
 * - schema.schemaVersion must be present and exactly CURRENT_SCHEMA_VERSION.
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
  } else if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: `schemaVersion must be exactly ${CURRENT_SCHEMA_VERSION}. Got: ${JSON.stringify(schemaVersion)}.`,
      path
    });
  }

  return errors;
}
