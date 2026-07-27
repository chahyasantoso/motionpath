/**
 * Functional plugin factory.
 *
 * `priority` controls deterministic composition order. `outputs` declares
 * render keys emitted by compose(), while `internalKeys` identifies proxy
 * state that must never reach a renderer. `prepare` is an optional async
 * preflight hook run by parseV4Project before the project is returned.
 */
export function createAnimationPlugin({
  keys = [],
  lazy = false,
  claimsKey,
  claimsWildcard = false,
  load,
  contribute,
  compose,
  prepare,
  stage = 'default',
  priority = 0,
  outputs = {},
  internalKeys = [],
} = {}) {
  return {
    keys,
    lazy,
    claimsWildcard,
    stage,
    priority,
    outputs,
    internalKeys,
    claimsKey: claimsKey || ((key) => keys.includes(key)),
    ...(typeof load === 'function' ? { load } : {}),
    contribute: contribute || (() => ({ percentPatch: {}, tweenVars: {} })),
    compose: compose || (() => ({})),
    ...(typeof prepare === 'function' ? { prepare } : {}),
  };
}
