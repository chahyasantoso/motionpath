/**
 * Creates a subscription queueing utility.
 * Buffers subscriptions made before the EngineCore is loaded and flushes
 * them synchronously when the core becomes active.
 *
 * This is the canonical Addendum A form. No `active` set, no error-swallowing.
 * A nonexistent elementId must throw synchronously through this module so the
 * caller sees a real stack trace rather than a silently-lost subscription.
 *
 * @returns {DeferredSubscribe}
 */
export function createDeferredSubscribe() {
  let core = null;
  let pending = [];

  return {
    setCore(newCore) {
      core = newCore;
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) {
          entry.realUnsubscribe = core.subscribe(entry.elementId, entry.callback);
        }
      }
    },

    clearCore() {
      core = null;
      pending = [];
    },

    subscribe(elementId, callback) {
      if (core) return core.subscribe(elementId, callback);
      const entry = { elementId, callback, cancelled: false, realUnsubscribe: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        if (entry.realUnsubscribe) entry.realUnsubscribe();
        pending = pending.filter(e => e !== entry);
      };
    },
  };
}
