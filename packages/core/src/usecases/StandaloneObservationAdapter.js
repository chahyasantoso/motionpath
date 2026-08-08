import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

/** Explicit standalone observation ownership for non-authored Track graphs. */
export class StandaloneObservationAdapter {
  #state;
  #sourceUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    const registry = tracks instanceof Map ? tracks : new Map(tracks.map((track) => [track.id, track]));
    this.#state = new ObservationState({ tracks: registry, validateCycles: false });
  }
  get state() { return this.#state; }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return this.#state.tracks; }

  register(track) { this.#assertAlive(); return this.#state.register(track); }
  unregister(id) {
    if (this.#destroyed) return;
    this.#sourceUnsubscribers.get(id)?.();
    this.#sourceUnsubscribers.delete(id);
    this.#state.unregister(id);
  }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#assertAlive();
    if (!observer?.id || !source?.id) throw new TypeError("StandaloneObservationAdapter.setObserved requires two tracks.");
    // Direct Track callers commonly create the two endpoints independently.
    // Registering both here keeps ownership external without requiring callers
    // to manually assemble a registry first.
    this.register(observer);
    this.register(source);
    if (!this.#sourceUnsubscribers.has(source.id) && typeof source.onSourceDestroyed === "function") {
      this.#sourceUnsubscribers.set(source.id, source.onSourceDestroyed(() => this.unregister(source.id)));
    }
    return this.#state.addEdge({ source: source.id, target: observer.id, role, input: role === "input" ? target ?? observer.id : undefined, mapFn: mapFn ?? null });
  }

  removeObserved(observer, source, { role, target } = {}) {
    if (this.#destroyed || !observer?.id || !source?.id) return;
    this.#state.removeEdge({ source: source.id, target: observer.id, role, input: target });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, { role, target } = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(newSource);
    if (!this.#sourceUnsubscribers.has(newSource.id) && typeof newSource.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(newSource.id, newSource.onSourceDestroyed(() => this.unregister(newSource.id)));
    return this.#state.replaceEdge({ source: oldSource.id, target: observer.id, role }, { source: newSource.id, target: observer.id, role, input: target, mapFn });
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter.compose requires a track.");
    this.register(track);
    return this.#state.compose(track.id, rawData, ctx, trackComposeLeaf);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#sourceUnsubscribers.values()) unsubscribe();
    this.#sourceUnsubscribers.clear();
    this.#state.destroy();
  }
  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
