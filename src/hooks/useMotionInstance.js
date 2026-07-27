import { useEffect, useRef, useState } from 'react';
import { engine } from '../engines/Engine.js';

/**
 * React Hook to mount and manage a v4 Motion/Track.
 * Automatically unmounts the instance THROUGH the engine when the component
 * unmounts, so the engine's instance registry stays accurate (R-04).
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

    const inst = engine.mountInstance(motionId, initialConfigRef.current);
    if (!inst) return undefined;

    setInstance(inst);

    return () => {
      // New Engine instances deregister through unmount(). Keep the fallback
      // for lightweight test doubles and older consumers that only expose
      // destroy(), without weakening the production lifecycle path.
      if (typeof engine.unmount === 'function') {
        engine.unmount(inst);
      } else {
        inst.destroy?.();
      }
      setInstance(null);
    };
  }, [motionId]);

  return instance;
}
