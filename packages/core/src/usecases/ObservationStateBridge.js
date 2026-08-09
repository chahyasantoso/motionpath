import { ObservationState } from "./ObservationState.js";
import { ObservationTrackController } from "./ObservationTrackController.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";

/** ObservationState owner used while authored graph wiring is externalized. */
export class ObservationStateBridge {
  #tracks;
  #state;
  #controller;
  #destroyed = false;
  #unsubscribers = [];
  constructor({ tracks = new Map(), edges } = {}) {
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#state = new ObservationState({ tracks: this.#tracks });
    if (edges) {
      for (const edge of edges) {
        if (this.#tracks.has(edge.source) && this.#tracks.has(edge.target)) this.#state.addEdge(edge);
      }
    } else {
      this.#hydrateFromOwners();
    }
    this.#controller = new ObservationTrackController({ state: this.#state, tracks: this.#tracks });
    this.#bindObserverSnapshots();
    this.#bindSourceCleanup();
  }
  get state() { return this.#state; }
  get controller() { return this.#controller; }
  get tracks() { return new Map(this.#tracks); }
  #hydrateFromOwners() {
    for (const track of this.#tracks.values()) {
      const ownerEdges = track.getObservationOwner?.()?.getEdges?.(track);
      const edges = ownerEdges ?? track.observedEdges ?? [];
      for (const edge of edges) {
        const source = typeof edge.source === "object" ? edge.source : this.#tracks.get(edge.source);
        if (source && this.#tracks.has(source.id)) this.#state.addEdge({ source: source.id, target: track.id, role: edge.role, input: edge.input, mapFn: edge.mapFn });
      }
    }
  }
  #bindObserverSnapshots() {
    for (const track of this.#tracks.values()) {
      const provider = () => this.#state.getObserverIds(track.id);
      if (typeof track._setObservationObserverIds === "function") track._setObservationObserverIds(provider);
      else if (!Object.prototype.hasOwnProperty.call(track, "observerIds")) Object.defineProperty(track, "observerIds", { configurable: true, get: provider });
    }
  }
  #bindSourceCleanup() {
    for (const source of this.#tracks.values()) {
      const unsubscribe = source.onSourceDestroyed?.(() => this.#state.removeSourceEdges(source.id));
      if (unsubscribe) this.#unsubscribers.push(unsubscribe);
    }
  }
  assertGraphParity(graph) {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    const expected = new Set((graph?.edges ?? []).map((edge) => this.#key(edge)));
    const actual = new Set();
    for (const track of this.#tracks.values()) for (const edge of this.#state.getEdges(track.id)) actual.add(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
    if (actual.size !== expected.size || [...actual].some((key) => !expected.has(key))) throw new Error("ObservationState mismatch: live graph wiring does not match declared edges in normalized graph IR.");
    return true;
  }
  assertParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) for (const edge of this.#state.getEdges(track.id)) if (!edge.source || !this.#tracks.has(edge.source.id)) throw new Error("ObservationState contains an edge for an unknown source.");
    return true;
  }
  assertCompositionParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) { if (track.isDestroyed || typeof track.composeLocal !== "function") continue; const live = track.compose(); const shadow = this.#state.compose(track.id, undefined, new Map(), trackComposeLeaf); if (!patchesEqual(live, shadow)) throw new Error(`ObservationState composition differs for track '${track.id}'.`); }
    return true;
  }
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    for (const track of this.#tracks.values()) {
      track._setObservationController?.(null);
      track._setObservationObserverIds?.(null);
    }
    this.#state.destroy();
    this.#tracks.clear();
  }
  #key({ source, target, role = "output", input }) { return [source, target, role, input ?? ""].join(String.fromCharCode(0)); }
}
