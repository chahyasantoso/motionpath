import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
    registerScrollTrigger: enableScrollTrigger ? registerScrollTrigger : () => undefined,
  });
}
