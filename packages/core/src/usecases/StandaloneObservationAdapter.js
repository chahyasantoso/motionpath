import { TrackObservationOwner } from "./TrackObservationOwner.js";

/** Explicit standalone observation ownership for non-authored Track graphs. */
export class StandaloneObservationAdapter {
  #owner;
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    const registry = tracks instanceof Map ? tracks : new Map(tracks.map((track) => [track.id, track]));
    this.#owner = new TrackObservationOwner({ tracks: registry, validateCycles: false, composeSource: (source, ctx) => typeof source.compose === "function" ? source.compose(undefined, ctx) : this.#owner.compose(source.id, undefined, ctx) });
    for (const track of registry.values()) this.#watchTrack(track);
  }
  get state() { return this.#owner.state; }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return this.#owner.tracks; }
  register(track) { this.#assertAlive(); const registered = this.#owner.register(track); this.#watchTrack(registered); return registered; }
  unregister(id) { if (this.#destroyed) return; this.#sourceUnsubscribers.get(id)?.(); this.#sourceUnsubscribers.delete(id); this.#lifecycleUnsubscribers.get(id)?.(); this.#lifecycleUnsubscribers.delete(id); this.#owner.unregister(id); }
  clearObserved(observer) { if (this.#destroyed || !observer?.id) return; for (const edge of this.#owner.getEdges(observer.id)) this.#owner.removeEdge({ source: edge.source.id, target: observer.id, role: edge.role, input: edge.input }); }
  setObserved(observer, source, mapFn, { role = "output", target } = {}) { this.#assertAlive(); if (!observer?.id || !source?.id) throw new TypeError("StandaloneObservationAdapter.setObserved requires two tracks."); this.register(observer); this.register(source); return this.#owner.addEdge({ source: source.id, target: observer.id, role, input: role === "input" ? target ?? observer.id : undefined, mapFn: mapFn ?? null }); }
  removeObserved(observer, source, { role, target } = {}) { if (this.#destroyed || !observer?.id || !source?.id) return; this.#owner.removeEdge({ source: source.id, target: observer.id, role, input: target }); }
  replaceObserved(observer, oldSource, newSource, mapFn, { role, target } = {}) { this.#assertAlive(); this.register(observer); this.register(newSource); return this.#owner.replaceEdge({ source: oldSource.id, target: observer.id, role }, { source: newSource.id, target: observer.id, role, input: target, mapFn }); }
  compose(track, rawData, ctx) { this.#assertAlive(); if (!track?.id) throw new TypeError("StandaloneObservationAdapter.compose requires a track."); this.register(track); return this.#owner.compose(track.id, rawData, ctx); }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; for (const unsubscribe of this.#sourceUnsubscribers.values()) unsubscribe(); for (const unsubscribe of this.#lifecycleUnsubscribers.values()) unsubscribe(); this.#sourceUnsubscribers.clear(); this.#lifecycleUnsubscribers.clear(); this.#owner.destroy(); }
  #watchTrack(track) { if (!track || this.#lifecycleUnsubscribers.has(track.id)) return; if (typeof track.onLifecycle === "function") this.#lifecycleUnsubscribers.set(track.id, track.onLifecycle((event) => { if (event?.type === "detached") this.#owner.removeSourceEdges(track.id); })); if (typeof track.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(track.id, track.onSourceDestroyed((event) => { if (event && Array.isArray(event.observerIds)) event.observerIds.splice(0, event.observerIds.length, ...this.#owner.getObserverIds(track.id)); this.unregister(track.id); })); }
  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
