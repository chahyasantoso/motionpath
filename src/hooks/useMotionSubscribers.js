import { useEffect, useRef } from 'react';
import { domRenderer } from '../renderers/domRenderer.js';

function sourcesSignature(sources) {
  return sources.map(s => `${s.instance?.id ?? ''}::${s.trackId ?? ''}`).join('|');
}

function subscribeToTrack(instance, trackId, getTransformFn, onPatch) {
  if (!instance || !trackId) return () => {};

  const composeFn = (data) => instance.compose(trackId, data);

  return instance.subscribe(trackId, (rawData) => {
    const transformFn = getTransformFn();
    const patch = typeof transformFn === 'function'
      ? transformFn(rawData, composeFn)
      : composeFn(rawData);
    onPatch(patch);
  });
}

/**
 * Merges N motion/track sources into one DOM write per tick. Each source may
 * have its own optional transformFn (same contract as the single-source
 * transformFn: receives (rawData, composeFn), returns a CSS patch). Every tick
 * from any one source re-merges all sources' latest patches and writes once via
 * domRenderer.
 *
 * mergeFn receives patches: Array<object> — one composed CSS patch per source.
 * If a source has a transformFn, that fn is responsible for any logic that
 * needs rawData (e.g. boundary checks on pathProgress).
 *
 * @param {Array<{instance: MotionInstance, trackId: string, transformFn?: Function}>} sources
 * @param {React.RefObject} ref
 * @param {(patches: object[]) => object} [mergeFn]
 *   Defaults to Object.assign of all patches in array order (last wins).
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
      subscribeToTrack(
        source.instance,
        source.trackId,
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
