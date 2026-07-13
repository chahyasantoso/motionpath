import { useEffect } from 'react';
import { productionEngine } from '../engines/ProductionEngine.js';

/**
 * Registers a DOM ref as the resolution target for a trigger-anchor id
 * (used by `trigger` / `startTrigger` / `pin` / `endTrigger` in motion
 * schemas). Replaces the old `data-motion-id` attribute + querySelector
 * lookup — this is a push registration instead of a DOM query.
 *
 * @param {string} id - matches the id string used in trigger/startTrigger/pin/endTrigger
 * @param {React.RefObject} ref
 */
export default function useMotionTrigger(id, ref) {
  useEffect(() => {
    if (!id || !ref) return undefined;
    productionEngine.registerTriggerRef(id, ref);
    return () => productionEngine.unregisterTriggerRef(id, ref);
  }, [id, ref]);
}
