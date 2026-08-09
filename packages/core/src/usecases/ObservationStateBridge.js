import { ObservationState } from "./ObservationState.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";
import { observationEdgeKey } from "./observationEdge.js";

/**
 * ObservationState owner used while live Track mutation is being extracted.
 *
 * The bridge may hydrate once from legacy Track edges for compatibility. After
 * construction, callers should compare the normalized graph to `state`, not
 * read Track edge projections again. That makes state the authoritative writer
 * and keeps Track as a temporary compatibility reader only.
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
      this.syncFromTracks();
    }
  }

  get state() { return this.#state; }
  get tracks() { return new Map(this.#tracks); }

  /**
   * Legacy hydration seam. It is intentionally one-way: later mutations must
   * write ObservationState first and must not rebuild it from Track readers.
   */
  syncFromTracks() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
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
    this.assertParity();
    return this;
  }

  /**
   * Compares the owner state with normalized graph IR. This is the replacement
   * for GraphBinding deriving its truth from Track.observedEdges.
   */
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
      throw new Error("ObservationState is out of parity with normalized graph IR.");
    }
    return true;
  }

  /** State-only edge snapshots for transaction rollback and inspection. */
  getEdges(targetId) {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    return this.#state.getEdges(targetId);
  }

  assertParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    const live = [];
    const shadow = [];
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) {
        if (this.#tracks.has(edge.source.id)) {
          live.push(this.#key({
            source: edge.source.id,
            target: track.id,
            role: edge.role,
            input: edge.input,
          }));
        }
      }
      for (const edge of this.#state.getEdges(track.id)) {
        shadow.push(this.#key({
          source: edge.source.id,
          target: track.id,
          role: edge.role,
          input: edge.input,
        }));
      }
    }
    live.sort();
    shadow.sort();
    if (live.length !== shadow.length || live.some((key, index) => key !== shadow[index])) {
      throw new Error("ObservationState is out of parity with live Track wiring.");
    }
    return true;
  }

  /** Composition parity proves value-level equivalence, not just edge-set parity. */
  assertCompositionParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      if (track.isDestroyed || typeof track.composeLocal !== "function" || typeof track.compose !== "function") continue;
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
