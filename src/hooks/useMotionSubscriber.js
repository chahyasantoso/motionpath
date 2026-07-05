import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from productionEngine
 * and applies them directly to a DOM element via gsap.set(), bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * @param {string} elementId - ID of the element to subscribe to (matches elements[].id in scene JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data (rawData)
 *   and compose function (rawData => patch) and must return an object of CSS properties for gsap.set().
 *   Should be wrapped in useCallback by the consumer.
 *   When absent, defaults to applying productionEngine.compose(elementId, rawData).
 */
export default function useMotionSubscriber(elementId, ref, transformFn) {
  const transformFnRef = useRef(transformFn);
  transformFnRef.current = transformFn;

  useEffect(() => {
    if (!elementId || !ref) {
      return;
    }

    // Subscribe to coordinate broadcasts for this element.
    const unsubscribe = productionEngine.subscribe(elementId, (rawData) => {
      if (!ref.current) return;

      const activeTransformFn = transformFnRef.current;

      if (typeof activeTransformFn === 'function') {
        gsap.set(ref.current, activeTransformFn(rawData, (data) => productionEngine.compose(elementId, data)));
      } else {
        // Default: compose raw data to target DOM-ready values and apply
        gsap.set(ref.current, productionEngine.compose(elementId, rawData));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [elementId, ref]);
}
