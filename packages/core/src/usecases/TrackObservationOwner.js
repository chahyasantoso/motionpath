import { ObservationState } from "./ObservationState.js";
import { trackComposeLeaf } from "./composeContext.js";

/**
 * Explicit observation owner, separated from Track playhead and lifecycle state.
 *
 * ## Status: on probation (finding F-08)
 *
 * Today this forwards to `ObservationState` and adds one thing of its own: the
 * `composeSource` seam, which lets a caller decide whether an observed source
 * composes through its own Track (standalone, where the Track may own an
 * adapter) or through this state (authored graphs, where it may not).
 *
 * That is thin. The review's position stands: either this class absorbs the
 * responsibilities the P2-03 symbol-ban removes from Track, namely observer
 * counts, lifecycle subscription and destroy ordering, or it should be deleted
 * and the adapter should use `ObservationState` directly. Do not let it stay a
 * pure pass-through layer, because a fourth hop in the edge-lookup path costs
 * real allocation on the compose hot path (F-09).
 */
export class TrackObservationOwner {
  #state;
  #composeSource;
  #destroyed = false;

  constructor({ tracks = new Map(), validateCycles = false, composeSource } = {}) {
    this.#state = new ObservationState({ tracks, validateCycles });
    this.#composeSource = typeof composeSource === "function" ? composeSource : null;
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

  register(track) {
    this.#assertAlive();
    return this.#state.register(track);
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

  removeSourceEdges(sourceId) {
    if (!this.#destroyed) this.#state.removeSourceEdges(sourceId);
  }

  replaceEdge(previous, next) {
    this.#assertAlive();
    return this.#state.replaceEdge(previous, next);
  }

  getEdges(targetId) {
    return this.#state.getEdges(targetId);
  }

  getSources(targetId) {
    return this.#state.getSources(targetId);
  }

  getObserverIds(sourceId) {
    return this.#state.getObserverIds(sourceId);
  }

  compose(targetId, rawData, ctx) {
    this.#assertAlive();
    return this.#state.compose(targetId, rawData, ctx, trackComposeLeaf, this.#composeSource ?? undefined);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#state.destroy();
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("TrackObservationOwner is destroyed.");
  }
}
