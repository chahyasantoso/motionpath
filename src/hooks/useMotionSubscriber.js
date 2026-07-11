import { useEffect, useRef } from 'react';
import { productionEngine } from '../lib/ProductionEngine';
import { domRenderer } from '../lib/renderers/domRenderer';

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from productionEngine
 * and applies them directly to a DOM element via domRenderer, bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * @param {string} trackId - ID of the track to subscribe to (matches tracks[].id in motion JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data (rawData)
 *   and compose function (rawData => patch) and must return an object of CSS properties for domRenderer.
 *   Should be wrapped in useCallback by the consumer.
 *   When absent, defaults to applying productionEngine.compose(trackId, rawData).
 */
export default function useMotionSubscriber(trackId, ref, transformFn) {
  const transformFnRef = useRef(transformFn);
  transformFnRef.current = transformFn;

  useEffect(() => {
    if (!trackId || !ref) {
      return;
    }

    // Subscribe to coordinate broadcasts for this track.
    const unsubscribe = productionEngine.subscribe(trackId, (rawData) => {
      if (!ref.current) return;

      const activeTransformFn = transformFnRef.current;

      if (typeof activeTransformFn === 'function') {
        domRenderer(ref.current, activeTransformFn(rawData, (data) => productionEngine.compose(trackId, data)));
      } else {
        // Default: compose raw data to target DOM-ready values and apply
        domRenderer(ref.current, productionEngine.compose(trackId, rawData));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [trackId, ref]);
}
