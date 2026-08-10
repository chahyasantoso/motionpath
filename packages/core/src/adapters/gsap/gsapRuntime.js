import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let scrollTriggerRegistered = false;
function registerScrollTrigger() {
  if (!scrollTriggerRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    scrollTriggerRegistered = true;
  }
  return ScrollTrigger;
}

/** The only GSAP construction boundary exposed to core assembly. */
export function createGsapRuntime({ enableScrollTrigger = true } = {}) {
  return Object.freeze({
    scheduler: Object.freeze({
      to: (target, vars) => gsap.to(target, vars),
      timeline: (vars) => gsap.timeline(vars),
    }),
    interpolator: Object.freeze({
      create: (target, vars) => gsap.to(target, { ...vars, paused: true }),
    }),
    clock: Object.freeze({
      subscribe(listener) {
        const callback = (_time, deltaTime) =>
          listener({ delta: (deltaTime || 0) / 1000 });
        gsap.ticker.add(callback);
        return () => gsap.ticker.remove(callback);
      },
    }),
    registerScrollTrigger: enableScrollTrigger
      ? registerScrollTrigger
      : () => undefined,
  });
}
export const gsapRuntime = createGsapRuntime();
