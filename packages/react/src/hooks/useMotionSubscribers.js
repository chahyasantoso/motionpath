import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  domRenderer,
  clearRendererTarget,
} from "@motionpath/core/adapters/domRenderer.js";
import { applyAnchor } from "@motionpath/core/lib/helpers.js";

function sourcesSignature(sources) {
  return sources
    .map((s) => `${s.instance?.id ?? ""}:${s.track?.id ?? s.trackId ?? ""}`)
    .join("|");
}

/**
 * Publisher-backed delivery.
 *
 * The graph composed this node once this tick and every subscriber reads the
 * same frozen patch, instead of each subscriber calling compose() itself and
 * paying for the node's whole upstream chain again. That is the entire point
 * of the publisher path: composition cost stops scaling with subscriber count.
 *
 * Two details that are easy to get wrong:
 *
 * - `patch.values` is deep-frozen. applyAnchor and domRenderer both treat the
 *   patch as theirs to touch, and mutating a frozen object throws in a module
 *   (always strict). Hand them a copy.
 * - `compose` keeps its meaning. Called with no argument it returns the
 *   published values, which is free. Called with custom raw data it really
 *   recomposes, because that is what a caller passing data is asking for.
 */
function subscribeToPatches(
  instance,
  trackId,
  getTransformFn,
  getAnchor,
  onPatch,
) {
  return instance.subscribe(trackId, (patch) => {
    const values = patch?.values ?? {};
    const transformFn = getTransformFn();
    let next;
    if (typeof transformFn === "function") {
      const track = instance.getTrack?.(trackId);
      const compose = (data) =>
        data === undefined ? { ...values } : instance.compose(trackId, data);
      next = transformFn(
        track && !track.isDestroyed ? track.getSnapshot() : { ...values },
        compose,
      );
    } else next = { ...values };
    onPatch(applyAnchor(next, getAnchor()));
  });
}

function subscribeToSource(source, getTransformFn, getAnchor, onPatch) {
  const instance = source.instance;
  const trackId = source.trackId ?? source.track?.id;
  // Preferred when available. Falls through to the Track path for standalone
  // tracks, for motions mounted with the gate off, and for any instance that
  // predates the runtime, so this is additive rather than a switch.
  if (
    instance?.usePublisherRendering &&
    trackId &&
    typeof instance.subscribe === "function"
  )
    return subscribeToPatches(
      instance,
      trackId,
      getTransformFn,
      getAnchor,
      onPatch,
    );
  let targetTrack = source.track;
  if (
    !targetTrack &&
    instance &&
    source.trackId &&
    typeof instance.getTrack === "function"
  )
    targetTrack = instance.getTrack(source.trackId);
  if (targetTrack?.subscribe)
    return targetTrack.subscribe((raw) => {
      const transformFn = getTransformFn();
      const compose = (data) => targetTrack.compose(data);
      const patch =
        typeof transformFn === "function"
          ? transformFn(raw, compose)
          : compose(raw);
      onPatch(applyAnchor(patch, getAnchor()));
    });
  if (instance?.subscribe && source.trackId)
    return instance.subscribe(source.trackId, (raw) => {
      const transformFn = getTransformFn();
      const compose = (data) => instance.compose(source.trackId, data);
      onPatch(
        applyAnchor(
          typeof transformFn === "function"
            ? transformFn(raw, compose)
            : compose(raw),
          getAnchor(),
        ),
      );
    });
  return () => {};
}
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]);
  transformFnsRef.current = sources.map((s) => s.transformFn);
  const anchorsRef = useRef([]);
  anchorsRef.current = sources.map((s) => s.anchor);
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
    let dirty = false;
    const render = () => {
      if (!ref.current || !dirty) return;
      dirty = false;
      const merge =
        mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches));
      domRenderer(ref.current, merge(latestPatches));
    };
    const ticker = gsap.ticker;
    const useTicker = Boolean(
      ticker &&
        typeof ticker.add === "function" &&
        typeof ticker.remove === "function",
    );
    if (useTicker) ticker.add(render);
    const unsubscribes = stableSources.map((source, index) =>
      subscribeToSource(
        source,
        () => transformFnsRef.current[index],
        () => anchorsRef.current[index],
        (patch) => {
          latestPatches[index] = patch || {};
          dirty = true;
          if (!useTicker) render();
        },
      ),
    );
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      if (useTicker) ticker.remove(render);
      if (ref.current) clearRendererTarget(ref.current);
    };
  }, [ref, stableSources]);
}
