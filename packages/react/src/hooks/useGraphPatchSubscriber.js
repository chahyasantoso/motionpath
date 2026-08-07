import { useEffect, useRef } from "react";
import { domRenderer, clearRendererTarget } from "@motionpath/core/adapters/domRenderer.js";

/**
 * Subscribe a DOM target to a GraphRuntime patch. The runtime owns composition;
 * React only schedules the renderer write and never calls Track.compose().
 */
export default function useGraphPatchSubscriber(runtime, nodeId, ref, transformFn) {
  const transformRef = useRef(transformFn); transformRef.current = transformFn;
  useEffect(() => {
    if (!runtime || !nodeId || !ref) return undefined;
    let pending = null;
    const unsubscribe = runtime.subscribe(nodeId, (patch) => {
      if (!patch || !ref.current) return;
      const values = typeof transformRef.current === "function" ? transformRef.current(patch.values, patch) : patch.values;
      pending = values || {};
      domRenderer(ref.current, pending);
    });
    return () => { unsubscribe?.(); pending = null; if (ref.current) clearRendererTarget(ref.current); };
  }, [runtime, nodeId, ref]);
}
