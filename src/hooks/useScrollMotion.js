import { useEffect, useRef, useState } from "react";
import { engine } from "../engines/Engine.js";
import { ScrollTriggerDelegate } from "../lib/TriggerDelegate.js";

/**
 * Mounts a scroll-triggered motion using component-local DOM refs instead of
 * the old string-id + TriggerRefRegistry indirection. Every call builds its
 * own delegate from its own refs, so multiple concurrent instances of the
 * same schema motion never collide on a shared id namespace -- there IS no
 * shared namespace.
 *
 * @param {Object|null} schema - the motion's schema object (e.g. scrollScene),
 *   or null to defer mounting (lazy-instancing gate, same convention as
 *   useMotionInstance's `motionId ? id : null` pattern).
 * @returns {{ refs: { trigger: RefObject, pin?: RefObject, endTrigger?: RefObject }, instance: Object|null }}
 */
export default function useScrollMotion(schema) {
  // Refs created unconditionally, every render, regardless of `schema` --
  // Rules of Hooks: the set of refs this hook allocates can't depend on a
  // value that might change across renders.
  const triggerRef = useRef(null);
  const pinRef = useRef(null);
  const endTriggerRef = useRef(null);
  const [instance, setInstance] = useState(null);

  const config = schema?.trigger;

  useEffect(() => {
    if (!schema?.id || !config || !triggerRef.current) return undefined;

    const delegate = new ScrollTriggerDelegate({
      ...config,
      trigger: triggerRef.current,
      pin: config.pin === "pin" ? pinRef.current : config.pin, // 'pin' role-string -> separate element; `true`/falsy pass through
      endTrigger: config.endTrigger ? endTriggerRef.current : undefined,
    });

    const motion = engine.mountWithDelegate(schema.id, delegate);
    setInstance(motion);

    return () => {
      // Deregister as well as destroy -- see R-04.
      engine.unmount(motion);
      setInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema?.id]);

  const refs = {
    trigger: triggerRef,
    pin: config?.pin === "pin" ? pinRef : undefined,
    endTrigger: config?.endTrigger ? endTriggerRef : undefined,
  };

  return { refs, instance };
}
