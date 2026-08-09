import { ObservationState } from "./ObservationState.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";

/**
 * ObservationState owner used while live Track mutation is being extracted.
 *
 * The bridge may hydrate once from legacy Track edges for compatibility. After
 * construction, every check is state-only: Track projections are never read to
 * decide whether the owner is correct. This makes ObservationState the
 * authoritative writer and keeps Track as a temporary compatibility reader.
 */
export class ObservationStateBridge {
  #tracks;
  #state;
  #destroyed = false;

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
  }

  get state() { return this.#state; }
  get tracks() { return new Map(this.#tracks); }

  /**
   * Construction-only compatibility hydration. Do not call this after the
   * bridge has been created: later mutations belong to ObservationState.
   */
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

  /** Compare owner state with normalized graph IR, without reading Track edges. */
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

  /**
   * State integrity check. This intentionally does not inspect Track readers.
   * `assertGraphParity(graph)` is the graph-level contract used by GraphBinding.
   */
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
    this.#state.destroy();
    this.#tracks.clear();
  }

  #key({ source, target, role = "output", input }) {
    return [source, target, role, input ?? ""].join(String.fromCharCode(0));
  }
}
