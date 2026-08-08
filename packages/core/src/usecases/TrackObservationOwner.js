import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

/** Explicit observation owner separated from Track playhead and lifecycle state. */
export class TrackObservationOwner {
  #state;
  #composeSource;
  #destroyed = false;

  constructor({ tracks = new Map(), validateCycles = false, composeSource } = {}) {
    this.#state = new ObservationState({ tracks, validateCycles });
    this.#composeSource = composeSource ?? ((source, ctx) => source.compose(undefined, ctx));
  }
  get state() { return this.#state; }
  get tracks() { return this.#state.tracks; }
  get isDestroyed() { return this.#destroyed; }
  register(track) { this.#assertAlive(); return this.#state.register(track); }
  unregister(id, options) { if (!this.#destroyed) this.#state.unregister(id, options); }
  addEdge(edge) { this.#assertAlive(); return this.#state.addEdge(edge); }
  removeEdge(edge) { if (!this.#destroyed) this.#state.removeEdge(edge); }
  removeSourceEdges(sourceId) { if (!this.#destroyed) this.#state.removeSourceEdges(sourceId); }
  replaceEdge(previous, next) { this.#assertAlive(); return this.#state.replaceEdge(previous, next); }
  getEdges(targetId) { return this.#state.getEdges(targetId); }
  getSources(targetId) { return this.#state.getSources(targetId); }
  getObserverIds(sourceId) { return this.#state.getObserverIds(sourceId); }
  compose(targetId, rawData, ctx) { this.#assertAlive(); return this.#state.compose(targetId, rawData, ctx, trackComposeLeaf, this.#composeSource); }
  destroy() { if (!this.#destroyed) { this.#destroyed = true; this.#state.destroy(); } }
  #assertAlive() { if (this.#destroyed) throw new Error("TrackObservationOwner is destroyed."); }
}
