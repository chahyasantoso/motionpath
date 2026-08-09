/** Canonical runtime-facing v4 contract constants. */
export const CURRENT_SCHEMA_VERSION = 4;
export const SUPPORTED_TRIGGER_TYPES = Object.freeze([
  "scroll",
  "time",
  "manual",
]);
export const OBSERVATION_ROLES = Object.freeze(["input", "output"]);
export const PLUGIN_STAGES = Object.freeze([
  "base",
  "filter",
  "media",
  "transform",
  "override",
  "default",
]);

export function isSupportedTriggerType(type) {
  return SUPPORTED_TRIGGER_TYPES.includes(type);
}

export function isObservationRole(role) {
  return OBSERVATION_ROLES.includes(role);
}
