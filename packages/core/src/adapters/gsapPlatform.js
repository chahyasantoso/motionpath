import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * The GSAP adapter boundary.
 *
 * Pass-2 P2-02: this module and the rest of `adapters/` are the only places in
 * `packages/core/src` allowed to import the `gsap` package directly. Core
 * orchestration imports `gsap` *from here* instead of from the vendor, so
 * there is exactly one edge in the dependency graph to cut when the remaining
 * call sites move onto the `Interpolator`, `Scheduler`, and `Clock` ports.
 *
 * Re-exporting the vendor object is deliberately not the same claim as "core
 * is GSAP-free". It is the prerequisite: a single choke point that a blocking
 * scan can defend, so no new direct vendor import can appear while the port
 * migration is still in progress.
 */
export { gsap };

let scrollTriggerRegistered = false;

export function registerScrollTrigger() {
  if (!scrollTriggerRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    scrollTriggerRegistered = true;
  }
  return ScrollTrigger;
}

export function createGsapPlatform({ enableScrollTrigger = true } = {}) {
  return Object.freeze({
    gsap,
    registerScrollTrigger: enableScrollTrigger
      ? registerScrollTrigger
      : () => undefined,
  });
}
