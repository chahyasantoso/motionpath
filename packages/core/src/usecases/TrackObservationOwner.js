import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

export class TrackObservationOwner {
  #state;
  #composeSource;
  #destroyed = false;
  constructor({
    tracks = new Map(),
    validateCycles = false,
    composeSource,
  } = {}) {
    this.#state = new ObservationState({ tracks, validateCycles });
    this.#composeSource =
      typeof composeSource === "function" ? composeSource : null;
  }
  get state() {
    return this.#state;
  }
  get tracks() {
    return this.#state.tracks;
  }
  get isDestroyed() {
    return this.#destroyed;
  }
  register(track, key = track?.id) {
    this.#assertAlive();
    return this.#state.register(track, key);
  }
  unregister(id, options) {
    if (!this.#destroyed) this.#state.unregister(id, options);
  }
  addEdge(edge) {
    this.#assertAlive();
    return this.#state.addEdge(edge);
  }
  removeEdge(edge) {
    if (!this.#destroyed) this.#state.removeEdge(edge);
  }
  removeSourceEdges(id) {
    if (!this.#destroyed) this.#state.removeSourceEdges(id);
  }
  replaceEdge(previous, next) {
    this.#assertAlive();
    return this.#state.replaceEdge(previous, next);
  }
  getEdges(id) {
    return this.#state.getEdges(id);
  }
  getSources(id) {
    return this.#state.getSources(id);
  }
  getObserverIds(id) {
    return this.#state.getObserverIds(id);
  }
  compose(id, rawData, ctx) {
    this.#assertAlive();
    return this.#state.compose(
      id,
      rawData,
      ctx,
      trackComposeLeaf,
      this.#composeSource ?? undefined,
    );
  }
  destroy() {
    if (!this.#destroyed) {
      this.#destroyed = true;
      this.#state.destroy();
    }
  }
  #assertAlive() {
    if (this.#destroyed) throw new Error("TrackObservationOwner is destroyed.");
  }
}
