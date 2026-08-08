/**
 * The single immutable-value utility for the v5 architecture.
 *
 * Pass-2 P2-01. Before this module there were two different notions of
 * "immutable" in the codebase: `PatchRegistry` deep-cloned and froze patch
 * values, while `ObservationGraph` and `GraphBinding` froze only their
 * containers and direct records. A graph snapshot therefore handed callers a
 * frozen wrapper around mutable arrays, and "the graph is immutable" was true
 * exactly one level deep.
 *
 * ## Supported value shape
 *
 * Closed data only: primitives (including `null` and `undefined`), arrays, and
 * plain objects (prototype `Object.prototype` or `null`).
 *
 * ## Copy versus reference
 *
 * Supported values are **cloned and then frozen**, never frozen in place.
 * Freezing in place is a side effect on an object the runtime does not own: a
 * plugin returning a cached contribution object would start throwing on its
 * own next write, in the consumer's code, for a reason that points nowhere
 * near this module.
 *
 * Anything outside the supported shape (DOM nodes, class instances, functions,
 * `Map`, `Set`, `Date`, typed arrays) is a **foreign reference**. It is passed
 * through by identity, untouched and unfrozen, because the runtime neither
 * owns it nor knows how to copy it. Callers who need a foreign value to be
 * immutable must convert it to supported data before publishing.
 *
 * Only string-keyed enumerable own properties are copied. Symbol keys and
 * non-enumerable properties are outside the contract.
 *
 * ## Identity and cycles
 *
 * `seen` maps each source object to its clone, so shared references stay
 * shared in the result and cycles terminate instead of overflowing the stack.
 * The clone is registered before its children are copied, which is what makes
 * a self-referencing value resolve to the same frozen clone.
 */

export function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Deep clone and freeze one supported value. Foreign references pass through. */
export function toImmutableValue(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) return existing;
    const clone = [];
    seen.set(value, clone);
    for (const entry of value) clone.push(toImmutableValue(entry, seen));
    return Object.freeze(clone);
  }
  if (!isPlainObject(value)) return value;
  const existing = seen.get(value);
  if (existing) return existing;
  const clone = {};
  seen.set(value, clone);
  for (const [key, entry] of Object.entries(value)) clone[key] = toImmutableValue(entry, seen);
  return Object.freeze(clone);
}

/**
 * Freeze a record of values. One `seen` map spans every key, so two values
 * that referenced the same object before still reference one object after.
 */
export function toImmutableValues(values, seen = new WeakMap()) {
  const frozen = {};
  for (const [key, value] of Object.entries(values ?? {})) frozen[key] = toImmutableValue(value, seen);
  return Object.freeze(frozen);
}

/**
 * Freeze a list of records and the list itself. Used for graph nodes, edges,
 * and diagnostics, where the array was previously frozen but its entries were
 * only shallow copies.
 */
export function toImmutableList(items, seen = new WeakMap()) {
  return Object.freeze((items ?? []).map((item) => toImmutableValue(item, seen)));
}
