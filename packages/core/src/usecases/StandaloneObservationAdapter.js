import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

/**
 * Explicit standalone observation ownership.
 *
 * Authored graphs use GraphBinding. Standalone mutual observation is a
 * separate, supported capability and must not be smuggled into Track as a
 * second graph implementation. This adapter gives that mode the same
 * ObservationState machinery while preserving its legal back-edge behavior.
 */
export class StandaloneObservationAdapter {
  #state;
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    const registry = tracks instanceof Map ? tracks : new Map(tracks.map((track) => [track.id, track]));
    this.#state = new ObservationState({ tracks: registry });
  }

  get state() { return this.#state; }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return this.#state.tracks; }

  register(track) {
    this.#assertAlive();
    return this.#state.register(track);
  }

  unregister(id) {
    if (this.#destroyed) return;
    this.#state.unregister(id);
  }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#assertAlive();
    if (!observer?.id || !source?.id) throw new TypeError("StandaloneObservationAdapter.setObserved requires two tracks.");
    return this.#state.addEdge({ source: source.id, target: observer.id, role, input: role === "input" ? target ?? observer.id : undefined, mapFn: mapFn ?? null });
  }

  removeObserved(observer, source, { role, target } = {}) {
    if (this.#destroyed || !observer?.id || !source?.id) return;
    this.#state.removeEdge({ source: source.id, target: observer.id, role, input: target });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, { role, target } = {}) {
    this.#assertAlive();
    return this.#state.replaceEdge(
      { source: oldSource.id, target: observer.id, role },
      { source: newSource.id, target: observer.id, role, input: target, mapFn },
    );
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter.compose requires a track.");
    return this.#state.compose(track.id, rawData, ctx, trackComposeLeaf);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#state.destroy();
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed.");
  }
}
