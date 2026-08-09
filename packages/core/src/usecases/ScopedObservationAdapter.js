import { TrackObservationOwner } from "./TrackObservationOwner.js";
import { COMPOSING } from "./composeContext.js";

/**
 * Scoped owner harness with the same public adapter contract.
 *
 * This intentionally preserves the compatibility protocol while ownership is
 * local to this instance. It is opt-in and not wired into Track yet; the next
 * integration slice can compare it with StandaloneObservationAdapter before
 * changing ProjectRuntime behavior.
 */
export class ScopedObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
  #nextIdentity = 0;
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    this.#owner = new TrackObservationOwner({
      validateCycles: false,
      composeSource: (source, ctx) => this.#composeSource(source, ctx),
    });
    for (const track of tracks instanceof Map ? tracks.values() : tracks) this.register(track);
  }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return new Map(this.#tracks); }
  register(track) { this.#assertAlive(); if (!track?.id) throw new TypeError("ScopedObservationAdapter requires a track."); if (this.#keys.has(track)) return track; const key = `${track.id}#${++this.#nextIdentity}`; this.#keys.set(track, key); this.#tracks.set(key, track); this.#owner.register(track, key); return track; }
  getEdges(track) { this.register(track); return this.#owner.getEdges(this.#keys.get(track)).map((edge) => ({ ...edge, source: edge.source, target: track.id })); }
  getSources(track) { return this.getEdges(track).map(({ source }) => source); }
  getObserverIds(track) { this.register(track); return this.#owner.getObserverIds(this.#keys.get(track)).map((key) => this.#owner.getTrack(key)?.id).filter(Boolean); }
  setObserved(observer, source, mapFn, options = {}) { this.register(observer); this.register(source); return this.#owner.addEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role: options.role ?? "output", input: options.role === "input" ? (options.target ?? observer.id) : undefined, mapFn: mapFn ?? null }); }
  removeObserved(observer, source, options = {}) { if (this.#destroyed) return; this.#owner.removeEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role: options.role, input: options.target }); }
  replaceObserved(observer, oldSource, newSource, mapFn, options = {}) { this.register(observer); this.register(oldSource); this.register(newSource); return this.#owner.replaceEdge({ source: this.#keys.get(oldSource), target: this.#keys.get(observer), role: options.role }, { source: this.#keys.get(newSource), target: this.#keys.get(observer), role: options.role, input: options.target, mapFn }); }
  compose(track, rawData, context) { this.#assertAlive(); this.register(track); const ctx = context ?? new Map(); const marker = ctx.get(track.id); if (marker === COMPOSING) return track.composeLocal?.(rawData) ?? track.getSnapshot?.() ?? {}; if (marker !== undefined) return marker; const internal = new Map(); for (const [publicId, patch] of ctx) { const known = this.#findTrack(publicId); if (known) internal.set(this.#keys.get(known), patch); } ctx.set(track.id, COMPOSING); const patch = this.#owner.compose(this.#keys.get(track), rawData, internal); ctx.set(track.id, patch); return patch; }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; this.#owner.destroy(); this.#tracks.clear(); }
  #findTrack(id) { for (const track of this.#tracks.values()) if (track.id === id) return track; return null; }
  #composeSource(source, ctx) { if (typeof source.compose === "function") return source.compose(undefined, this.#publicContext(ctx)); const key = this.#keys.get(source); if (!key) return source.getSnapshot?.() ?? {}; return this.#owner.compose(key, undefined, ctx); }
  #publicContext(ctx) { const publicContext = new Map(); for (const [key, patch] of ctx) { const track = this.#owner.getTrack(key); if (track) publicContext.set(track.id, patch); } return publicContext; }
  #assertAlive() { if (this.#destroyed) throw new Error("ScopedObservationAdapter is destroyed."); }
}
