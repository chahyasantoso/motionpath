import { ObservationState } from "./ObservationState.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";

/**
 * ObservationState owner used while live Track mutation is being extracted.
 *
 * The bridge may hydrate from legacy Track edges only during construction. After
 * that, parity checks are state-only. It also supplies the temporary public
 * observer snapshot contract from owner state, so Track no longer needs a
 * reverse observer index of its own.
 */
export class ObservationStateBridge {
  #tracks;
  #state;
  #destroyed = false;
  #unsubscribers = [];

  constructor({ tracks = new Map(), edges } = {}) {
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#state = new ObservationState({ tracks: this.#tracks });
    if (edges) {
      for (const edge of edges) {
        if (this.#tracks.has(edge.source) && this.#tracks.has(edge.target)) {
          this.#state.addEdge(edge);
        }
      }
    } else {
      this.#hydrateFromTracks();
    }
    this.#bindObserverProviders();
    this.#bindSourceCleanup();
  }

  get state() { return this.#state; }
  get tracks() { return new Map(this.#tracks); }

  /** Construction-only compatibility hydration. */
  #hydrateFromTracks() {
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) {
        if (!this.#tracks.has(edge.source.id)) continue;
        this.#state.addEdge({
          source: edge.source.id,
          target: track.id,
          role: edge.role,
          input: edge.input,
          mapFn: edge.mapFn,
        });
      }
    }
  }

  /** Temporary lifecycle bridge until Track's public observer snapshot is gone. */
  #bindObserverProviders() {
    for (const track of this.#tracks.values()) {
      track._setObservationObserverIds?.(() => this.#state.getObserverIds(track.id));
    }
  }

  /** Destroy subscribers run before Track unregisters, so state can drive cleanup. */
  #bindSourceCleanup() {
    for (const source of this.#tracks.values()) {
      const unsubscribe = source.onSourceDestroyed?.(() => {
        const observerIds = this.#state.getObserverIds(source.id);
        for (const observerId of observerIds) {
          const observer = this.#tracks.get(observerId);
          observer?.removeObserved(source);
        }
        this.#state.removeSourceEdges(source.id);
      });
      if (unsubscribe) this.#unsubscribers.push(unsubscribe);
    }
  }

  assertGraphParity(graph) {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    const expected = new Set((graph?.edges ?? []).map((edge) => this.#key(edge)));
    const actual = new Set();
    for (const track of this.#tracks.values()) {
      for (const edge of this.#state.getEdges(track.id)) {
        actual.add(this.#key({
          source: edge.source.id,
          target: track.id,
          role: edge.role,
          input: edge.input,
        }));
      }
    }
    if (actual.size !== expected.size || [...actual].some((key) => !expected.has(key))) {
      throw new Error("ObservationState mismatch: live Track wiring does not match declared edges in normalized graph IR.");
    }
    return true;
  }

  /** State integrity check. This intentionally does not inspect Track readers. */
  assertParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      for (const edge of this.#state.getEdges(track.id)) {
        if (!edge.source || !this.#tracks.has(edge.source.id)) {
          throw new Error("ObservationState contains an edge for an unknown source.");
        }
      }
    }
    return true;
  }

  /** Composition parity proves value-level equivalence, not just edge-set parity. */
  assertCompositionParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      if (track.isDestroyed || typeof track.composeLocal !== "function") continue;
      const live = track.compose();
      const shadow = this.#state.compose(track.id, undefined, new Map(), trackComposeLeaf);
      if (!patchesEqual(live, shadow)) {
        throw new Error(`ObservationState composition differs from live Track composition for track '${track.id}'.`);
      }
    }
    return true;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    for (const track of this.#tracks.values()) track._setObservationObserverIds?.(null);
    this.#state.destroy();
    this.#tracks.clear();
  }

  #key({ source, target, role = "output", input }) {
    return [source, target, role, input ?? ""].join(String.fromCharCode(0));
  }
}
