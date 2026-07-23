import { useEffect, useRef, useState } from 'react';
import { productionEngine } from '../engines/ProductionEngine.js';

/**
 * React Hook to mount and manage a MotionInstance or v4 Motion/Track.
 * Automatically destroys/unmounts the instance when the component unmounts.
 * 
 * NOTE: The `config` parameter is mount-time-only. Changing `config` after the
 * component has mounted does not trigger a remount or update the running instance.
 *
 * @param {string} motionId
 * @param {Object} [config]
 * @returns {Object|null}
 */
export default function useMotionInstance(motionId, config) {
  const [instance, setInstance] = useState(null);
  const initialConfigRef = useRef(config);
  const warnedConfigChangeRef = useRef(false);

  if (
    import.meta.env?.DEV &&
    !warnedConfigChangeRef.current &&
    initialConfigRef.current !== config
  ) {
    warnedConfigChangeRef.current = true;
    console.warn(
      '[useMotionInstance] config is mount-time-only. Changing config after mount has no effect.'
    );
  }

  useEffect(() => {
    if (!motionId) return undefined;
    
    const inst = productionEngine.mountInstance(motionId, initialConfigRef.current);
    if (!inst) return undefined;
    
    // Attach declarative ref callback binders if requiredTriggerIds is defined
    const triggers = {};
    const requiredTriggerIds = inst.requiredTriggerIds ?? [];
    requiredTriggerIds.forEach(id => {
      let activeRef = null;
      triggers[id] = (el) => {
        if (el) {
          activeRef = { current: el };
          productionEngine.registerTriggerRef(id, activeRef);
        } else {
          if (activeRef) {
            productionEngine.unregisterTriggerRef(id, activeRef);
            activeRef = null;
          }
        }
      };
    });
    inst.triggers = triggers;

    setInstance(inst);

    return () => {
      if (typeof inst.destroy === 'function') {
        inst.destroy();
      }
      setInstance(null);
    };
  }, [motionId]);

  return instance;
}
