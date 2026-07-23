import { gsap } from 'gsap';
import { domRenderer } from '../renderers/domRenderer.js';
import { mergePatches } from './Track.js';

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}

export function autoPlay(track, durationSeconds, vars = {}) {
  return gsap.to(track, { progress: 1, duration: durationSeconds, ...vars });
}

export class EventBus {
  #listeners = new Map();

  on(name, cb) {
    if (!this.#listeners.has(name)) {
      this.#listeners.set(name, new Set());
    }
    this.#listeners.get(name).add(cb);
    return () => {
      this.#listeners.get(name)?.delete(cb);
    };
  }

  emit(name, payload) {
    this.#listeners.get(name)?.forEach(cb => cb(payload));
  }
}

export const eventBus = new EventBus();

export function playOnEvent(track, eventName, vars = {}) {
  return eventBus.on(eventName, (payload) => {
    if (payload?.id !== track.id) return;
    gsap.to(track, { progress: 0, duration: 0 });
    gsap.to(track, { progress: 1, ...vars });
  });
}

export function switchToTrack(el, fromTrack, unsubscribeFrom, toTrack, vars = {}) {
  const frozenPosition = fromTrack.compose(fromTrack.getSnapshot());
  if (typeof unsubscribeFrom === 'function') {
    unsubscribeFrom();
  }
  const unsub = toTrack.subscribe(raw => {
    domRenderer(el, mergePatches(frozenPosition, toTrack.compose(raw)));
  });
  gsap.to(toTrack, { progress: 1, ...vars });
  return unsub;
}

/**
  * Merges xPercent / yPercent into composed patch if anchor is defined.
  * Omitted anchor stays a strict no-op returning the original patch reference.
  */
export function applyAnchor(patch, anchor) {
  if (!anchor) return patch;
  return { ...patch, ...anchor };
}
