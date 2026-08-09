/** Renderer-neutral clock port. */
export function assertClock(clock, context = "Clock") {
  if (!clock || typeof clock.subscribe !== "function")
    throw new TypeError(`${context} requires subscribe(listener).`);
  return clock;
}

export function createManualClock() {
  const listeners = new Set();
  let tickNumber = 0;
  return {
    subscribe(listener) {
      if (typeof listener !== "function")
        throw new TypeError("Clock listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick(delta = 0) {
      if (!(Number.isFinite(delta) && delta >= 0))
        throw new TypeError(
          "Clock delta must be a finite non-negative number.",
        );
      tickNumber += 1;
      for (const listener of [...listeners])
        listener({ tick: tickNumber, delta });
      return tickNumber;
    },
    get tickNumber() {
      return tickNumber;
    },
    dispose() {
      listeners.clear();
    },
  };
}

/**
 * Normalize any tick source into the clock contract and fan it out.
 *
 * Two jobs, both of which the publisher path needs before it can run every
 * frame:
 *
 * 1. Shape. `gsapTickerClock` emits a bare delta number because its existing
 *    demo callers expect one. `GraphRuntime.start` destructures `{ tick }`.
 *    Destructuring a number silently yields undefined rather than failing, so
 *    the tick counter would have quietly become a private increment and the
 *    delta would have been dropped. Normalize once, here, instead of teaching
 *    every consumer to accept both shapes.
 *
 * 2. Multiplexing. One subscription upstream no matter how many runtimes are
 *    listening. A project with twenty mounted motions must not add twenty
 *    callbacks to the GSAP ticker, and it must not leave any attached once the
 *    last runtime is disposed: the upstream subscription is released when the
 *    listener count returns to zero and re-attached if a listener arrives
 *    later, which is what makes a clock safe to hold across a project reload.
 *
 * The counter is monotonic across detach/attach cycles. Tick numbers are used
 * for retry backoff scheduling in GraphPublisher, so they must never go
 * backwards.
 */
export function createTickClock(source) {
  assertClock(source, "createTickClock source");
  const listeners = new Set();
  let unsubscribeSource = null;
  let tickNumber = 0;
  let disposed = false;
  const emit = (event) => {
    const delta = typeof event === "number" ? event : Number(event?.delta ?? 0);
    tickNumber += 1;
    const payload = {
      tick: tickNumber,
      delta: Number.isFinite(delta) ? delta : 0,
    };
    for (const listener of [...listeners]) listener(payload);
  };
  const attach = () => {
    if (!unsubscribeSource && !disposed)
      unsubscribeSource = source.subscribe(emit) ?? null;
  };
  const detach = () => {
    const unsubscribe = unsubscribeSource;
    unsubscribeSource = null;
    unsubscribe?.();
  };
  return {
    subscribe(listener) {
      if (typeof listener !== "function")
        throw new TypeError("Clock listener must be a function.");
      if (disposed) throw new Error("Clock is disposed.");
      listeners.add(listener);
      attach();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) detach();
      };
    },
    get tickNumber() {
      return tickNumber;
    },
    get listenerCount() {
      return listeners.size;
    },
    get isAttached() {
      return unsubscribeSource !== null;
    },
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      detach();
    },
  };
}
