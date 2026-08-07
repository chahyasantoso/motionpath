/** Renderer-neutral clock port. */
export function assertClock(clock, context = "Clock") {
  if (!clock || typeof clock.subscribe !== "function") throw new TypeError(`${context} requires subscribe(listener).`);
  return clock;
}

export function createManualClock() {
  const listeners = new Set();
  let tickNumber = 0;
  return {
    subscribe(listener) { if (typeof listener !== "function") throw new TypeError("Clock listener must be a function."); listeners.add(listener); return () => listeners.delete(listener); },
    tick(delta = 0) { if (!(Number.isFinite(delta) && delta >= 0)) throw new TypeError("Clock delta must be a finite non-negative number."); tickNumber += 1; for (const listener of [...listeners]) listener({ tick: tickNumber, delta }); return tickNumber; },
    get tickNumber() { return tickNumber; },
    dispose() { listeners.clear(); },
  };
}
