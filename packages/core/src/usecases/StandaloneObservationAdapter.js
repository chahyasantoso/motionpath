import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

/** Explicit standalone observation ownership for non-authored Track graphs. */
export class StandaloneObservationAdapter {
  #state;
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    const registry = tracks instanceof Map ? tracks : new Map(tracks.map((track) => [track.id, track]));
    this.#state = new ObservationState({ tracks: registry, validateCycles: false });
    for (const track of registry.values()) this.#watchTrack(track);
  }
  get state() { return this.#state; }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return this.#state.tracks; }
  register(track) { this.#assertAlive(); const registered = this.#state.register(track); this.#watchTrack(registered); return registered; }
  unregister(id) { if (this.#destroyed) return; this.#sourceUnsubscribers.get(id)?.(); this.#sourceUnsubscribers.delete(id); this.#lifecycleUnsubscribers.get(id)?.(); this.#lifecycleUnsubscribers.delete(id); this.#state.unregister(id); }
  clearObserved(observer) { if (this.#destroyed || !observer?.id) return; for (const edge of this.#state.getEdges(observer.id)) this.#state.removeEdge({ source: edge.source.id, target: observer.id, role: edge.role, input: edge.input }); }
  setObserved(observer, source, mapFn, { role = "output", target } = {}) { this.#assertAlive(); if (!observer?.id || !source?.id) throw new TypeError("StandaloneObservationAdapter.setObserved requires two tracks."); this.register(observer); this.register(source); return this.#state.addEdge({ source: source.id, target: observer.id, role, input: role === "input" ? target ?? observer.id : undefined, mapFn: mapFn ?? null }); }
  removeObserved(observer, source, { role, target } = {}) { if (this.#destroyed || !observer?.id || !source?.id) return; this.#state.removeEdge({ source: source.id, target: observer.id, role, input: target }); }
  replaceObserved(observer, oldSource, newSource, mapFn, { role, target } = {}) { this.#assertAlive(); this.register(observer); this.register(newSource); return this.#state.replaceEdge({ source: oldSource.id, target: observer.id, role }, { source: newSource.id, target: observer.id, role, input: target, mapFn }); }
  compose(track, rawData, ctx) { this.#assertAlive(); if (!track?.id) throw new TypeError("StandaloneObservationAdapter.compose requires a track."); this.register(track); return this.#state.compose(track.id, rawData, ctx, trackComposeLeaf, (source, sharedCtx) => typeof source.compose === "function" ? source.compose(undefined, sharedCtx) : this.#state.compose(source.id, undefined, sharedCtx, trackComposeLeaf)); }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; for (const unsubscribe of this.#sourceUnsubscribers.values()) unsubscribe(); for (const unsubscribe of this.#lifecycleUnsubscribers.values()) unsubscribe(); this.#sourceUnsubscribers.clear(); this.#lifecycleUnsubscribers.clear(); this.#state.destroy(); }
  #watchTrack(track) { if (!track || this.#lifecycleUnsubscribers.has(track.id)) return; if (typeof track.onLifecycle === "function") this.#lifecycleUnsubscribers.set(track.id, track.onLifecycle((event) => { if (event?.type === "detached") this.#state.removeSourceEdges(track.id); })); if (typeof track.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(track.id, track.onSourceDestroyed((event) => { if (event && Array.isArray(event.observerIds)) event.observerIds.splice(0, event.observerIds.length, ...this.#state.getObserverIds(track.id)); this.unregister(track.id); })); }
  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
