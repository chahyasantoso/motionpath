import { useEffect, useRef } from 'react';
import { domRenderer } from '../renderers/domRenderer.js';

function sourcesSignature(sources) {
  return sources.map(s => `${s.instance?.id ?? ''}::${s.trackId ?? ''}`).join('|');
}

function subscribeToTrack(instance, trackId, getTransformFn, onFrame) {
  if (!instance || !trackId) return () => {};

  const composeFn = (data) => instance.compose(trackId, data);

  return instance.subscribe(trackId, (rawData) => {
    const transformFn = getTransformFn();
    const patch = typeof transformFn === 'function'
      ? transformFn(rawData, composeFn)
      : composeFn(rawData);
    onFrame({ raw: rawData, patch });
  });
}

/**
 * Merges N motion/track sources into one DOM write per tick. Each source may
 * have its own optional transformFn (same contract as the single-source
 * transformFn: receives (rawData, composeFn), returns a CSS patch). Every tick
 * from any one source re-merges all sources' latest frames and writes once via
 * domRenderer.
 *
 * mergeFn receives frames: Array<{ raw: object, patch: object }>
 *   - frame.raw  : the unprocessed data from the track (includes pathProgress etc.)
 *   - frame.patch: the composed CSS patch (from transformFn or default compose)
 *
 * The default merge combines only frame.patch values — raw data never leaks to
 * domRenderer unless a custom mergeFn explicitly includes it.
 *
 * @param {Array<{instance: MotionInstance, trackId: string, transformFn?: Function}>} sources
 * @param {React.RefObject} ref
 * @param {(frames: Array<{raw: object, patch: object}>) => object} [mergeFn]
 *   Defaults to Object.assign of all frame.patch values in array order (last wins).
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

    const latestFrames = stableSources.map(() => ({ raw: {}, patch: {} }));

    const applyMerged = () => {
      if (!ref.current) return;
      const merge = mergeFnRef.current ?? ((frames) => Object.assign({}, ...frames.map(f => f.patch)));
      domRenderer(ref.current, merge(latestFrames));
    };

    const unsubscribes = stableSources.map((source, i) =>
      subscribeToTrack(
        source.instance,
        source.trackId,
        () => transformFnsRef.current[i],
        (frame) => {
          latestFrames[i] = frame;
          applyMerged();
        }
      )
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [ref, stableSources]);
}
