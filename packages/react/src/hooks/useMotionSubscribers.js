import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { domRenderer, clearRendererTarget } from "../../../../packages/core/src/adapters/domRenderer.js";
import { applyAnchor } from "../../../../packages/core/src/lib/helpers.js";

function sourcesSignature(sources) { return sources.map((s) => `${s.instance?.id ?? ""}:${s.track?.id ?? s.trackId ?? ""}`).join("|"); }
function subscribeToSource(source, getTransformFn, getAnchor, onPatch) {
  let targetTrack = source.track;
  if (!targetTrack && source.instance && source.trackId && typeof source.instance.getTrack === "function") targetTrack = source.instance.getTrack(source.trackId);
  if (targetTrack?.subscribe) return targetTrack.subscribe((raw) => { const transformFn = getTransformFn(); const compose = (data) => targetTrack.compose(data); const patch = typeof transformFn === "function" ? transformFn(raw, compose) : compose(raw); onPatch(applyAnchor(patch, getAnchor())); });
  const instance = source.instance; const trackId = source.trackId;
  if (instance?.subscribe && trackId) return instance.subscribe(trackId, (raw) => { const transformFn = getTransformFn(); const compose = (data) => instance.compose(trackId, data); onPatch(applyAnchor(typeof transformFn === "function" ? transformFn(raw, compose) : compose(raw), getAnchor())); });
  return () => {};
}
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]); transformFnsRef.current = sources.map((s) => s.transformFn);
  const anchorsRef = useRef([]); anchorsRef.current = sources.map((s) => s.anchor);
  const mergeFnRef = useRef(mergeFn); mergeFnRef.current = mergeFn;
  const signature = sourcesSignature(sources); const signatureRef = useRef(signature); const stableSourcesRef = useRef(sources);
  if (signature !== signatureRef.current) { signatureRef.current = signature; stableSourcesRef.current = sources; }
  const stableSources = stableSourcesRef.current;
  useEffect(() => { if (!ref) return undefined; const latestPatches = stableSources.map(() => ({})); let dirty = false; const render = () => { if (!ref.current || !dirty) return; dirty = false; const merge = mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches)); domRenderer(ref.current, merge(latestPatches)); }; const ticker = gsap.ticker; const useTicker = Boolean(ticker && typeof ticker.add === "function" && typeof ticker.remove === "function"); if (useTicker) ticker.add(render); const unsubscribes = stableSources.map((source, index) => subscribeToSource(source, () => transformFnsRef.current[index], () => anchorsRef.current[index], (patch) => { latestPatches[index] = patch || {}; dirty = true; if (!useTicker) render(); })); return () => { unsubscribes.forEach((unsubscribe) => unsubscribe()); if (useTicker) ticker.remove(render); if (ref.current) clearRendererTarget(ref.current); }; }, [ref, stableSources]);
}
