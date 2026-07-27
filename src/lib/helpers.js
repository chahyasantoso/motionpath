import { gsap } from 'gsap';
import { domRenderer } from '../renderers/domRenderer.js';
import { mergePatches } from '../usecases/mergePatches.js';
import { EventBus } from './eventBus.js';

export { EventBus };
export { mergePatches };

export function autoPlay(track, durationSeconds, vars = {}) { return gsap.to(track, { progress: 1, duration: durationSeconds, ...vars }); }
export const eventBus = new EventBus();
export function playOnEvent(track, eventName, vars = {}) { return eventBus.on(eventName, (payload) => { if (payload?.id !== track.id) return; gsap.to(track, { progress: 0, duration: 0 }); gsap.to(track, { progress: 1, ...vars }); }); }
export function switchToTrack(el, fromTrack, unsubscribeFrom, toTrack, vars = {}) {
  const frozenPosition = fromTrack.compose(fromTrack.getSnapshot());
  unsubscribeFrom?.();
  const unsub = toTrack.subscribe((raw) => domRenderer(el, mergePatches(frozenPosition, toTrack.compose(raw))));
  gsap.to(toTrack, { progress: 1, ...vars });
  return unsub;
}
export function applyAnchor(patch, anchor) {
  if (!anchor) return patch;
  const result = { ...patch, ...anchor };
  if (anchor.offset) { result.x = (patch.x ?? 0) + (anchor.offset.x ?? 0); result.y = (patch.y ?? 0) + (anchor.offset.y ?? 0); delete result.offset; }
  return result;
}
