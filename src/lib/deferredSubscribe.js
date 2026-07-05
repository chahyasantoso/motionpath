/**
 * Creates a subscription queueing utility.
 * Buffers subscriptions made before the EngineCore is loaded and flushes/rewires
 * them synchronously when the core becomes active.
 *
 * @returns {DeferredSubscribe}
 */
export function createDeferredSubscribe() {
  let core = null;
  let pending = [];
  const active = new Set();

  return {
    setCore(newCore) {
      core = newCore;

      // 1. Re-subscribe already active/flushed subscriptions to the new core
      for (const entry of active) {
        try {
          entry.realUnsubscribe = core.subscribe(entry.elementId, entry.callback);
        } catch (e) {
          entry.realUnsubscribe = null;
        }
      }

      // 2. Flush pending/buffered subscriptions
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) {
          try {
            entry.realUnsubscribe = core.subscribe(entry.elementId, entry.callback);
            active.add(entry);
          } catch (e) {
            // Ignore if element is not in buildResult
          }
        }
      }
    },

    clearCore() {
      core = null;
      for (const entry of active) {
        entry.realUnsubscribe = null;
      }
    },

    subscribe(elementId, callback) {
      if (core) {
        const entry = { elementId, callback, realUnsubscribe: null };
        try {
          entry.realUnsubscribe = core.subscribe(elementId, callback);
        } catch (e) {
          // Ignore if element does not exist in core yet
        }
        active.add(entry);
        return () => {
          active.delete(entry);
          if (entry.realUnsubscribe) {
            entry.realUnsubscribe();
          }
        };
      }

      const entry = { elementId, callback, cancelled: false, realUnsubscribe: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        pending = pending.filter(e => e !== entry);
        active.delete(entry);
        if (entry.realUnsubscribe) {
          entry.realUnsubscribe();
        }
      };
    },
  };
}
