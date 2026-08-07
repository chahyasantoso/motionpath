/**
 * The supported patch value shape is closed data: primitives, arrays, and
 * plain objects. `PatchRegistry` froze only the patch, `values`, and
 * `sourceRevisions`, so anything nested inside a value stayed mutable and the
 * architecture contract that patches are immutable was true one level deep.
 *
 * Values are cloned rather than frozen in place. Freezing in place is a side
 * effect on an object the runtime does not own: a plugin that returns a cached
 * contribution object would start throwing on its own next write, in the
 * consumer's code, for a reason that points nowhere near the registry.
 *
 * Anything outside the supported shape (DOM nodes, class instances, functions)
 * is a foreign reference. It is passed through by identity, untouched and
 * unfrozen, because the runtime neither owns it nor knows how to copy it.
 */

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * `seen` maps each source object to its clone, so shared references stay shared
 * in the result and cycles terminate instead of overflowing the stack. The
 * clone is registered before its children are copied, which is what makes a
 * self-referencing value resolve to the same frozen clone.
 */
export function toImmutablePatchValue(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) return existing;
    const clone = [];
    seen.set(value, clone);
    for (const entry of value) clone.push(toImmutablePatchValue(entry, seen));
    return Object.freeze(clone);
  }
  if (!isPlainObject(value)) return value;
  const existing = seen.get(value);
  if (existing) return existing;
  const clone = {};
  seen.set(value, clone);
  for (const [key, entry] of Object.entries(value)) clone[key] = toImmutablePatchValue(entry, seen);
  return Object.freeze(clone);
}

/**
 * One `seen` map spans every top-level key, so two values that referenced the
 * same object before publishing still reference one object afterwards.
 */
export function toImmutablePatchValues(values) {
  const seen = new WeakMap();
  const frozen = {};
  for (const [key, value] of Object.entries(values ?? {})) frozen[key] = toImmutablePatchValue(value, seen);
  return Object.freeze(frozen);
}
