import { useEffect, useState } from "react";
import { engine } from "@motionpath/core/engines/Engine";

export default function useMotionInstance(motionId) {
  const [instance, setInstance] = useState(null);
  useEffect(() => {
    if (!motionId) return undefined;
    const inst = engine.mountInstance(motionId);
    if (!inst) return undefined;
    setInstance(inst);
    return () => {
      if (typeof engine.unmount === "function") engine.unmount(inst);
      else inst.destroy?.();
      setInstance(null);
    };
  }, [motionId]);
  return instance;
}
