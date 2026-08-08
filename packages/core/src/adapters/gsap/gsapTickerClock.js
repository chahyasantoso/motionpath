import { gsap } from "../gsapPlatform.js";

/**
 * Adapter that gives orchestration code one shared GSAP-owned clock.
 *
 * Moved here from `lib/` by pass-2 P2-02. The implementation is unchanged: it
 * still emits a bare millisecond delta, because existing demo callers and
 * `Spawner` are written against that signature. `ports/Clock.js`
 * (`createTickClock`) is the thing that normalizes this into the `{ tick,
 * delta }` contract and multiplexes it, and that is where the shape change
 * belongs, not here.
 */
export const gsapTickerClock = {
  subscribe(listener) {
    const callback = (_time, deltaTime) => listener(deltaTime || 0);
    gsap.ticker.add(callback);
    return () => gsap.ticker.remove(callback);
  },
};
