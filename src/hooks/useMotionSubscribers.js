import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { domRenderer } from '../renderers/domRenderer.js';
import { applyAnchor } from '../lib/helpers.js';

function sourcesSignature(sources) {
  return sources.map((s) => {
    const trackId = s.track?.id ?? s.trackId ?? '';
    const instId = s.instance?.id ?? '';
    return `${instId}:${trackId}`;
  }).join('|');
}

function subscribeToSource(source, getTransformFn, getAnchor, onPatch) {
  let targetTrack = source.track;
  if (!targetTrack && source.instance && source.trackId && typeof source.instance.getTrack === 'function') targetTrack = source.instance.getTrack(source.trackId);
  if (targetTrack && typeof targetTrack.subscribe === 'function') {
    return targetTrack.subscribe((raw) => {
      const transformFn = getTransformFn();
      const basePatch = typeof transformFn === 'function' ? transformFn(raw, (data) => targetTrack.compose(data)) : targetTrack.compose(raw);
      onPatch(applyAnchor(basePatch, getAnchor()));
    });
  }
  // Legacy adapter retained only for consumers that still provide a compatible instance.
  const instance = source.instance; const trackId = source.trackId;
  if (instance && typeof instance.subscribe === 'function' && trackId) {
    const composeFn = (data) => instance.compose(trackId, data);
    return instance.subscribe(trackId, (rawData) => {
      const transformFn = getTransformFn();
      const basePatch = typeof transformFn === 'function' ? transformFn(rawData, composeFn) : composeFn(rawData);
      onPatch(applyAnchor(basePatch, getAnchor()));
    });
  }
  return () => {};
}

/**
 * Merges N sources into one DOM write per GSAP tick. Source callbacks only
 * replace their latest patch and mark the target dirty. If a test adapter does
 * not expose gsap.ticker, it falls back to the old immediate behavior.
 */
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]); transformFnsRef.current = sources.map((s) => s.transformFn);
  const anchorsRef = useRef([]); anchorsRef.current = sources.map((s) => s.anchor);
  const mergeFnRef = useRef(mergeFn); mergeFnRef.current = mergeFn;
  const signature = sourcesSignature(sources);
  const signatureRef = useRef(signature);
  const stableSourcesRef = useRef(sources);
  if (signature !== signatureRef.current) { signatureRef.current = signature; stableSourcesRef.current = sources; }
  const stableSources = stableSourcesRef.current;

  useEffect(() => {
    if (!ref) return undefined;
    const latestPatches = stableSources.map(() => ({}));
    let dirty = false;
    const mergeAndRender = () => {
      if (!ref.current || !dirty) return;
      dirty = false;
      const merge = mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches));
      domRenderer(ref.current, merge(latestPatches));
    };
    const ticker = gsap.ticker;
    const useTicker = ticker && typeof ticker.add === 'function' && typeof ticker.remove === 'function';
    if (useTicker) ticker.add(mergeAndRender);
    const unsubscribes = stableSources.map((source, i) => subscribeToSource(source, () => transformFnsRef.current[i], () => anchorsRef.current[i], (patch) => {
      latestPatches[i] = patch;
      dirty = true;
      if (!useTicker) mergeAndRender();
    }));
    return () => { unsubscribes.forEach((fn) => fn()); if (useTicker) ticker.remove(mergeAndRender); };
  }, [ref, stableSources]);
}
