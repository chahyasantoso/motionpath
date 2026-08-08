/**
 * Shared compose-context protocol for observation composition.
 *
 * `ctx` is a per-call Map keyed by track id. A value of COMPOSING marks a node
 * whose composition is already in progress on the current stack. That marker is
 * how a legal standalone back-edge terminates: the re-entrant call falls back
 * to the node's own leaf patch instead of recursing forever.
 *
 * The marker lives here rather than as a private constant on Track because
 * Track and ObservationState must agree on it. While observation ownership
 * moves out of Track the two walkers can share a single ctx, and two separate
 * private symbols would silently disable the back-edge guard on one side.
 */
export const COMPOSING = Symbol("motionpath.composing");

/**
 * The `composeLeaf` that ObservationState expects: a track's own plugin output
 * with no observation edges applied.
 *
 * Leaf composition has to be a named seam. When the walker and the leaf live in
 * the same method there is no way to hand the edge walk to another owner, which
 * is exactly why the observation state stayed inside Track this long.
 *
 * @param {{ id?: string, composeLocal?: (rawData?: object) => object }} track
 * @param {object} [rawData]
 */
export function trackComposeLeaf(track, rawData) {
  if (typeof track?.composeLocal !== "function") {
    throw new TypeError(`Track '${track?.id ?? "?"}' does not expose composeLocal().`);
  }
  return track.composeLocal(rawData);
}

/**
 * Structural equality for composed patch values.
 *
 * Used by parity assertions, so it deliberately does not go through
 * JSON.stringify: key order is not part of patch identity, and stringify would
 * report a false difference for two equal patches built in a different order.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function patchesEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") {
    return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((value, index) => patchesEqual(value, b[index]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.hasOwn(b, key) && patchesEqual(a[key], b[key]));
}
