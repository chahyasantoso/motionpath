import { useEffect, useState } from "react";
import { engine } from "@motionpath/core/engines/Engine";

/**
 * React Hook to mount and manage a v4 Motion/Track.
 * Automatically unmounts the instance THROUGH the engine when the component
 * unmounts, so the engine's instance registry stays accurate (R-04).
 *
 * Trigger behavior belongs in the v4 project schema. Scroll motions that need
 * component-owned DOM refs use useScrollMotion; this hook only mounts a
 * project-owned Motion or Track by id.
 *
 * @param {string} motionId
 * @returns {Object|null}
 */
export default function useMotionInstance(motionId) {
  const [instance, setInstance] = useState(null);

  useEffect(() => {
    if (!motionId) return undefined;

    const inst = engine.mountInstance(motionId);
    if (!inst) return undefined;

    setInstance(inst);

    return () => {
      // New Engine instances deregister through unmount(). Keep the fallback
      // for lightweight test doubles and older consumers that only expose
      // destroy(), without weakening the production lifecycle path.
      if (typeof engine.unmount === "function") {
        engine.unmount(inst);
      } else {
        inst.destroy?.();
      }
      setInstance(null);
    };
  }, [motionId]);

  return instance;
}
