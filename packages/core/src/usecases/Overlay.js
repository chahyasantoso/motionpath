import { gsap } from "gsap";
export class Overlay {
  #source = null; #overlay = null; #mapFn = null; #generation = 0; #tween = null; #destroyed = false;
  attach(sourceTrack, overlayTrack, mapFn = (patch) => patch) { this.#assertAlive(); this.replace(); if (!sourceTrack || !overlayTrack) throw new TypeError("Overlay.attach requires source and overlay tracks."); this.#source = sourceTrack; this.#overlay = overlayTrack; this.#mapFn = mapFn; sourceTrack.setObserved(overlayTrack, mapFn); return this; }
  replace(sourceTrack = null, overlayTrack = null, mapFn) { this.#generation += 1; this.#tween?.kill(); this.#tween = null; if (this.#source && this.#overlay) this.#source.removeObserved(this.#overlay); this.#source = null; this.#overlay = null; this.#mapFn = null; if (sourceTrack || overlayTrack) return this.attach(sourceTrack, overlayTrack, mapFn); return this; }
  play(progress = 1, { duration = 0.35, ease = "none" } = {}) { this.#assertAlive(); if (!this.#overlay) return Promise.reject(new Error("Overlay has no attached tracks.")); const generation = this.#generation; this.#tween?.kill(); return new Promise((resolve, reject) => { this.#tween = gsap.to(this.#overlay, { progress, duration, ease, onComplete: () => { if (generation !== this.#generation || this.#destroyed) return reject(new Error("Overlay animation superseded or destroyed.")); resolve(this.#overlay); } }); }); }
  detach() { return this.replace(); }
  destroy() { if (this.#destroyed) return; const overlay = this.#overlay; this.#destroyed = true; this.replace(); overlay?.destroy?.(); }
  #assertAlive() { if (this.#destroyed) throw new Error("Overlay is destroyed."); }
}
