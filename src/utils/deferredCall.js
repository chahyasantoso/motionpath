/**
 * Creates a call queueing utility.
 * Buffers calls made before the EngineCore is loaded and flushes
 * them synchronously when the core becomes active.
 *
 * @returns {DeferredCall}
 */
export function createDeferredCall() {
  let core = null;
  let pending = [];

  return {
    setCore(newCore) {
      core = newCore;
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) {
          entry.cleanup = entry.run(newCore);
        }
      }
    },

    clearCore() {
      core = null;
      pending = [];
    },

    /**
     * Executes the run function immediately if core is active,
     * or buffers it until setCore is called.
     * Returns a cancellation function.
     *
     * @param {function(object): function|undefined} run - receives the active core
     * @returns {function()} unsubscribe/cancel function
     */
    call(run) {
      if (core) return run(core);
      const entry = { run, cancelled: false, cleanup: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        if (entry.cleanup) entry.cleanup();
        pending = pending.filter(e => e !== entry);
      };
    },
  };
}
