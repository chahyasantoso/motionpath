import { CURRENT_SCHEMA_VERSION } from "../../contract/v4.js";

export { CURRENT_SCHEMA_VERSION };
export const SUPPORTED_SCHEMA_VERSIONS = [CURRENT_SCHEMA_VERSION];

/**
 * Runtime schema guard. v2/v3 migrators do not exist, and the v4 validator
 * rejects their fields, so advertising support for those versions is fiction.
 */
export function schemaVersionRule(schema, path = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: "Project schema must be a valid JSON object.",
      path,
    });
    return errors;
  }
  const { schemaVersion } = schema;
  if (schemaVersion === undefined || schemaVersion === null)
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: "schemaVersion is missing.",
      path,
    });
  else if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion))
    errors.push({
      ruleId: "schema-version",
      severity: "error",
      message: `schemaVersion must be ${CURRENT_SCHEMA_VERSION}. Got: ${JSON.stringify(schemaVersion)}.`,
      path,
    });
  return errors;
}
