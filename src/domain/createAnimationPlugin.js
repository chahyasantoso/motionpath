/**
 * Functional plugin factory.
 *
 * `keys` are authored keyframe properties contributed by the plugin.
 * `inputs` are composed values consumed from observations or other runtime
 * composition sources. They are not authored animation properties.
 */
export function createAnimationPlugin({
  keys = [],
  inputs = [],
  lazy = false,
  claimsKey,
  claimsWildcard = false,
  load,
  contribute,
  compose,
  prepare,
  stage = "default",
  priority = 0,
  outputs = {},
  internalKeys = [],
} = {}) {
  return {
    keys,
    inputs,
    lazy,
    claimsWildcard,
    stage,
    priority,
    outputs,
    internalKeys,
    claimsKey: claimsKey || ((key) => keys.includes(key)),
    ...(typeof load === "function" ? { load } : {}),
    contribute: contribute || (() => ({ percentPatch: {}, tweenVars: {} })),
    compose: compose || (() => ({})),
    ...(typeof prepare === "function" ? { prepare } : {}),
  };
}
