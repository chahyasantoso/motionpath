import { useEffect, useRef, useState } from "react";
import { engine } from "../engines/Engine.js";
import { ScrollTriggerDelegate } from "../lib/TriggerDelegate.js";

const NO_SHARED_REFS = Object.freeze({});

/**
 * Mounts a scroll-triggered motion using component-local DOM refs instead of
 * the old string-id + TriggerRefRegistry indirection. Every call builds its
 * own delegate from its own refs, so multiple concurrent instances of the
 * same schema motion never collide on a shared id namespace -- there IS no
 * shared namespace.
 *
 * A DOM node can only carry one ref, so when two motions must observe the
 * SAME element (typical scrollytelling pairing: one scrubbed timeline plus
 * one toggleActions observer on the same section) the caller owns the refs
 * and hands them to both hooks via `sharedRefs`. Passing nothing keeps the
 * original self-allocating behavior.
 *
 * @param {Object|null} schema - the motion's schema object (e.g. scrollScene),
 *   or null to defer mounting (lazy-instancing gate, same convention as
 *   useMotionInstance's `motionId ? id : null` pattern).
 * @param {{ trigger?: RefObject, pin?: RefObject, endTrigger?: RefObject }} [sharedRefs]
 *   Caller-owned refs that override the hook's own. Must be stable across
 *   renders (i.e. produced by useRef), like any ref.
 * @returns {{ refs: { trigger: RefObject, pin?: RefObject, endTrigger?: RefObject }, instance: Object|null }}
 */
export default function useScrollMotion(schema, sharedRefs = NO_SHARED_REFS) {
  // Refs created unconditionally, every render, regardless of `schema` --
  // Rules of Hooks: the set of refs this hook allocates can't depend on a
  // value that might change across renders.
  const ownTriggerRef = useRef(null);
  const ownPinRef = useRef(null);
  const ownEndTriggerRef = useRef(null);
  const [instance, setInstance] = useState(null);

  const triggerRef = sharedRefs.trigger ?? ownTriggerRef;
  const pinRef = sharedRefs.pin ?? ownPinRef;
  const endTriggerRef = sharedRefs.endTrigger ?? ownEndTriggerRef;

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
