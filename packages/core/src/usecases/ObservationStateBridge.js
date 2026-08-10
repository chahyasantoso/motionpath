import { ObservationState } from "./ObservationState.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";

/** Transitional bridge exposing one state and parity checks during Phase 1. */
export class ObservationStateBridge {
  #tracks;
  #state;
  #destroyed = false;

  constructor({ tracks = new Map(), edges = [] } = {}) {
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#state = new ObservationState({ tracks: this.#tracks });
    for (const edge of edges) {
      if (this.#tracks.has(edge.source) && this.#tracks.has(edge.target))
        this.#state.addEdge(edge);
    }
  }
  get state() { return this.#state; }
  get controller() {
    return {
      getEdges: (target) => this.#state.getEdges(target),
      getSources: (target) => this.#state.getSources(target),
      getObserverIds: (source) => this.#state.getObserverIds(source),
      setObserved: (observer, source, mapFn, options) => this.#state.addEdge({ source: source.id, target: observer.id, mapFn, role: options?.role ?? "output", input: options?.role === "input" ? (options.target ?? observer.id) : undefined }),
      removeObserved: (observer, source, options) => this.#state.removeEdge({ source: source.id, target: observer.id, role: options?.role, input: options?.target }),
      replaceObserved: (observer, oldSource, newSource, mapFn, options) => this.#state.replaceEdge({ source: oldSource.id, target: observer.id, role: options?.role }, { source: newSource.id, target: observer.id, role: options?.role, input: options?.target, mapFn }),
      clearObserved: (observer) => this.#state.getEdges(observer.id).forEach((edge) => this.#state.removeEdge({ source: edge.source.id, target: observer.id, role: edge.role, input: edge.input })),
      removeSourceEdges: (source) => this.#state.removeSourceEdges(source.id),
      compose: (track, raw, ctx) => this.#state.compose(track.id, raw, ctx, trackComposeLeaf),
    };
  }
  get tracks() { return new Map(this.#tracks); }
  assertParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    return true;
  }
  assertGraphParity(graph) {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    const expected = new Set((graph?.edges ?? []).map((edge) => this.#key(edge)));
    const actual = new Set();
    for (const track of this.#tracks.values())
      for (const edge of this.#state.getEdges(track.id))
        actual.add(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
    if (expected.size !== actual.size || [...expected].some((key) => !actual.has(key)))
      throw new Error("ObservationState mismatch: live graph wiring does not match declared edges.");
    return true;
  }
  assertCompositionParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      if (track.isDestroyed) continue;
      if (!patchesEqual(track.compose(), this.#state.compose(track.id, undefined, new Map(), trackComposeLeaf)))
        throw new Error(`ObservationState composition differs for track '${track.id}'.`);
    }
    return true;
  }
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#state.destroy();
    this.#tracks.clear();
  }
  #key({ source, target, role = "output", input }) { return [source, target, role, input ?? ""].join(String.fromCharCode(0)); }
}
