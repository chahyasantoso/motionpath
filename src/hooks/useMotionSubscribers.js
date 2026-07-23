import { useEffect, useRef } from 'react';
import { domRenderer } from '../renderers/domRenderer.js';
import { applyAnchor } from '../lib/helpers.js';

function sourcesSignature(sources) {
  return sources.map(s => {
    const trackId = s.track?.id ?? s.trackId ?? '';
    const instId = s.instance?.id ?? '';
    return `${instId}:${trackId}`;
  }).join('|');
}

function subscribeToSource(source, getTransformFn, onPatch) {
  let targetTrack = source.track;

  if (!targetTrack && source.instance && source.trackId) {
    if (typeof source.instance.getTrack === 'function') {
      targetTrack = source.instance.getTrack(source.trackId);
    }
  }

  // v4 Track subscription
  if (targetTrack && typeof targetTrack.subscribe === 'function') {
    return targetTrack.subscribe((raw) => {
      const transformFn = getTransformFn();
      const basePatch = typeof transformFn === 'function'
        ? transformFn(raw, (data) => targetTrack.compose(data))
        : targetTrack.compose(raw);
      const patch = applyAnchor(basePatch, source.anchor);
      onPatch(patch);
    });
  }

  // v3 MotionInstance subscription
  const instance = source.instance;
  const trackId = source.trackId;
  if (instance && typeof instance.subscribe === 'function' && trackId) {
    const composeFn = (data) => instance.compose(trackId, data);
    return instance.subscribe(trackId, (rawData) => {
      const transformFn = getTransformFn();
      const basePatch = typeof transformFn === 'function'
        ? transformFn(rawData, composeFn)
        : composeFn(rawData);
      const patch = applyAnchor(basePatch, source.anchor);
      onPatch(patch);
    });
  }

  return () => {};
}

/**
 * Merges N motion/track sources into one DOM write per tick.
 * Supports both v3 MotionInstance and v4 Motion/Track instances, as well as optional source.anchor.
 */
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]);
  transformFnsRef.current = sources.map(s => s.transformFn);

  const mergeFnRef = useRef(mergeFn);
  mergeFnRef.current = mergeFn;

  const signature = sourcesSignature(sources);
  const signatureRef = useRef(signature);
  const stableSourcesRef = useRef(sources);
  if (signature !== signatureRef.current) {
    signatureRef.current = signature;
    stableSourcesRef.current = sources;
  }
  const stableSources = stableSourcesRef.current;

  useEffect(() => {
    if (!ref) return undefined;

    const latestPatches = stableSources.map(() => ({}));

    const applyMerged = () => {
      if (!ref.current) return;
      const merge = mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches));
      domRenderer(ref.current, merge(latestPatches));
    };

    const unsubscribes = stableSources.map((source, i) =>
      subscribeToSource(
        source,
        () => transformFnsRef.current[i],
        (patch) => {
          latestPatches[i] = patch;
          applyMerged();
        }
      )
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [ref, stableSources]);
}
