/**
 * Functional plugin factory.
 *
 * `priority` controls deterministic composition order. Lower values compose
 * first. `outputs` declares render keys emitted by compose(), allowing the
 * compiler to reject ambiguous overlaps instead of relying on JSON key order.
 */
export function createAnimationPlugin({
  keys = [],
  lazy = false,
  claimsKey,
  contribute,
  compose,
  stage = 'default',
  priority = 0,
  outputs = {},
  internalKeys = [],
} = {}) {
  return {
    keys,
    lazy,
    stage,
    priority,
    outputs,
    internalKeys,
    claimsKey: claimsKey || ((key) => keys.includes(key)),
    contribute: contribute || (() => ({ percentPatch: {}, tweenVars: {} })),
    compose: compose || (() => ({})),
  };
}
