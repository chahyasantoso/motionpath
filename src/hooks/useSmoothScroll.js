import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Custom React hook to enable Lenis smooth scrolling.
 * Syncs ScrollTrigger updates with the Lenis smooth scroll offset.
 *
 * @param {boolean} [enabled=true] - Toggle smooth scrolling on/off.
 * @param {Object} [options={}] - Custom Lenis initialization options.
 */
export default function useSmoothScroll(enabled = true, options = {}) {
  useEffect(() => {
    if (!enabled) return;

    // 1. Initialize Lenis
    const lenis = new Lenis({
      lerp: options.lerp ?? 0.1,
      ...options
    });

    // 2. Notify ScrollTrigger on every scroll step
    lenis.on('scroll', ScrollTrigger.update);

    // 3. Link to GSAP Ticker for frame synchronization
    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    // 4. Cleanup on unmount
    return () => {
      lenis.destroy();
      gsap.ticker.remove(updateTicker);
    };
  }, [enabled, options.lerp]);
}
