import { gsap } from 'gsap';
import { domRenderer } from '../renderers/domRenderer.js';
import { mergePatches } from '../usecases/mergePatches.js';

/**
 * Freeze the current pose of `fromTrack`, then hand the element over to
 * `toTrack`. This is DOM-aware, so it belongs in the hooks layer: keeping it
 * in lib/helpers.js forced an inner layer to import renderers/.
 */
export function switchToTrack(el, fromTrack, unsubscribeFrom, toTrack, vars = {}) {
  const frozenPosition = fromTrack.compose(fromTrack.getSnapshot());
  unsubscribeFrom?.();
  const unsub = toTrack.subscribe((raw) => domRenderer(el, mergePatches(frozenPosition, toTrack.compose(raw))));
  gsap.to(toTrack, { progress: 1, ...vars });
  return unsub;
}
