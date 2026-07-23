export const CURRENT_SCHEMA_VERSION = 4;
export const SUPPORTED_SCHEMA_VERSIONS = [2, 3, 4];

/**
 * Rule: schema-version
 * Top-level guard.
 *
 * Requirements:
 * - schema.schemaVersion must be present and one of SUPPORTED_SCHEMA_VERSIONS.
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
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: `schemaVersion must be one of [${SUPPORTED_SCHEMA_VERSIONS.join(', ')}]. Got: ${JSON.stringify(schemaVersion)}.`,
      path
    });
  }

  return errors;
}
