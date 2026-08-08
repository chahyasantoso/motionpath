/**
 * Deprecated location. Kept as a re-export so existing deep imports of
 * `@motionpath/core/lib/gsapTickerClock.js` and the published
 * `./gsapTickerClock.js` export key keep resolving.
 *
 * The implementation moved to the adapter surface in pass-2 P2-02. New code
 * should import from `@motionpath/core/adapters/gsap/gsapTickerClock.js`.
 * This shim is deletion candidate work for P2-06, not before: removing it
 * early would break consumers while the replacement path is still landing.
 */
export { gsapTickerClock } from "../adapters/gsap/gsapTickerClock.js";
