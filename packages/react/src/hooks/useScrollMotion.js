import { useEffect, useRef, useState } from "react";
import { engine } from "../../../../packages/core/src/engines/Engine.js";
import { ScrollTriggerDelegate } from "../../../../packages/core/src/lib/TriggerDelegate.js";
const NO_SHARED_REFS = Object.freeze({});
export default function useScrollMotion(schema, sharedRefs = NO_SHARED_REFS) {
  const ownTriggerRef = useRef(null); const ownPinRef = useRef(null); const ownEndTriggerRef = useRef(null); const [instance, setInstance] = useState(null);
  const triggerRef = sharedRefs.trigger ?? ownTriggerRef; const pinRef = sharedRefs.pin ?? ownPinRef; const endTriggerRef = sharedRefs.endTrigger ?? ownEndTriggerRef; const config = schema?.trigger;
  useEffect(() => { if (!schema?.id || !config || !triggerRef.current) return undefined; const delegate = new ScrollTriggerDelegate({ ...config, trigger: triggerRef.current, pin: config.pin === "pin" ? pinRef.current : config.pin, endTrigger: config.endTrigger ? endTriggerRef.current : undefined }); const motion = engine.mountWithDelegate(schema.id, delegate); setInstance(motion); return () => { engine.unmount(motion); setInstance(null); }; }, [schema?.id]);
  return { refs: { trigger: triggerRef, pin: config?.pin === "pin" ? pinRef : undefined, endTrigger: config?.endTrigger ? endTriggerRef : undefined }, instance };
}
