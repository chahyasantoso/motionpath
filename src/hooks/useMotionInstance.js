import { useEffect, useState } from 'react';
import { productionEngine } from '../engines/ProductionEngine.js';

/**
 * React Hook to mount and manage a MotionInstance.
 * Automatically destroys the instance when the component unmounts.
 *
 * @param {string} motionId
 * @param {Object} [config]
 * @returns {MotionInstance|null}
 */
export default function useMotionInstance(motionId, config) {
  const [instance, setInstance] = useState(null);

  useEffect(() => {
    if (!motionId) return undefined;
    
    const inst = productionEngine.mountInstance(motionId, config);
    setInstance(inst);

    return () => {
      inst.destroy();
      setInstance(null);
    };
  }, [motionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return instance;
}
