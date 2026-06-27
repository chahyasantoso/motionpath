import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import motionEngine from '../lib/motionEngine';

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from motionEngine
 * and applies them directly to a DOM element via gsap.set(), bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * @param {string} elementId - ID of the element to subscribe to (matches elements[].id in scene JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data ({ x, y, rotation, progress })
 *   and must return an object of CSS properties for gsap.set(). Should be wrapped in useCallback by the consumer.
 *   When absent, defaults to { x, y, rotation }. `progress` (0.0–1.0) is only accessible through this function.
 */
export default function useMotionSubscriber(elementId, ref, transformFn) {
  // Store transformFn in a ref to avoid stale closures without causing re-subscribe.
  // This lets the consumer update transformFn without triggering useEffect cleanup/re-run.
  const transformFnRef = useRef(transformFn);
  transformFnRef.current = transformFn;

  useEffect(() => {
    if (!elementId || !ref) {
      return;
    }

    if (ref.current) {
      motionEngine._domRefs = motionEngine._domRefs || new Map();
      motionEngine._domRefs.set(elementId, ref.current);
    }

    // Subscribe to coordinate broadcasts for this element.
    // The engine handles late-subscriber caching — it immediately sends
    // the last known proxy position to prevent jumping visual bugs (motionEngine.js:84-86).
    const unsubscribe = motionEngine.subscribe(elementId, (data) => {
      if (!ref.current) return;

      const overrideFn = motionEngine._transformOverrides?.get(elementId);
      const activeTransformFn = overrideFn || transformFnRef.current;

      if (typeof activeTransformFn === 'function') {
        // Custom transform: consumer has full access to { x, y, rotation, progress }
        gsap.set(ref.current, activeTransformFn(data));
      } else {
        // Default: apply spatial properties only. progress is NOT set to DOM
        // because it is not a valid CSS property.
        gsap.set(ref.current, {
          x: data.x,
          y: data.y,
          z: data.z,
          rotation: data.rotation,
        });
      }
    });

    // Cleanup: remove listener from engine's internal Set to prevent memory leaks
    // (motionEngine.js:89-97)
    return () => {
      unsubscribe();
      motionEngine._domRefs?.delete(elementId);
    };
  }, [elementId]); // ref is a stable React ref, transformFnRef is a stable useRef
}
