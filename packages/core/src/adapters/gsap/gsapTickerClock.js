import { gsap } from "gsap";

/**
 * Adapter that gives orchestration code one shared GSAP-owned clock.
 *
 * Relocated from `lib/` in pass-2 P2-02. The module was always an adapter by
 * intent, but it lived inside core orchestration, which meant importing the
 * engine pulled GSAP into the module graph from a path the architecture rules
 * forbid. Behavior is unchanged on purpose: it still emits a bare millisecond
 * delta, and `createTickClock` is still the thing that normalizes that into
 * the `{ tick, delta }` clock contract and multiplexes it.
 */
export const gsapTickerClock = {
  subscribe(listener) {
    const callback = (_time, deltaTime) => listener(deltaTime || 0);
    gsap.ticker.add(callback);
    return () => gsap.ticker.remove(callback);
  },
};
