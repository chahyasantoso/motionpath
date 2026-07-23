import { useEffect } from 'react';
import { engine } from '../engines/Engine.js';

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
    engine.registerTriggerRef(id, ref);
    return () => engine.unregisterTriggerRef(id, ref);
  }, [id, ref]);
}
