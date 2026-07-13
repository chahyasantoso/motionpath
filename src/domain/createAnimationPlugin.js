/**
 * Functional plugin factory — replaces the old AnimationPlugin base class.
 * Plugins are plain objects with { keys, lazy, claimsKey, contribute, compose }.
 * No classes, no inheritance, no `this` context issues.
 *
 * @param {Object} config
 * @param {string[]} [config.keys=[]] - Property keys this plugin handles
 * @param {boolean} [config.lazy=false] - Whether plugin loads lazily
 * @param {Function} [config.claimsKey] - Custom key matching (default: exact match in keys)
 * @param {Function} [config.contribute] - Builds GSAP keyframe patches
 * @param {Function} [config.compose] - Composes runtime patch from resolved data
 * @returns {Object} Plugin object
 */
export function createAnimationPlugin({
  keys = [],
  lazy = false,
  claimsKey,
  contribute,
  compose
} = {}) {
  return {
    keys,
    lazy,
    claimsKey: claimsKey || ((key) => keys.includes(key)),
    contribute: contribute || (() => ({ percentPatch: {}, tweenVars: {} })),
    compose: compose || (() => ({}))
  };
}
