import { gsap } from 'gsap';

/** Adapter that gives orchestration code one shared GSAP-owned clock. */
export const gsapTickerClock = {
  subscribe(listener) {
    const callback = (_time, deltaTime) => listener(deltaTime || 0);
    gsap.ticker.add(callback);
    return () => gsap.ticker.remove(callback);
  },
};
