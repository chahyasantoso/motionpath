import { ObservationState } from "./ObservationState.js";
import { patchesEqual, trackComposeLeaf } from "./composeContext.js";

/** Shadow bridge used while live Track mutation is being extracted. */
export class ObservationStateBridge {
  #tracks;
  #state;
  #destroyed = false;

  constructor({ tracks = new Map() } = {}) {
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#state = new ObservationState({ tracks: this.#tracks });
    this.syncFromTracks();
  }

  get state() { return this.#state; }
  get tracks() { return new Map(this.#tracks); }

  syncFromTracks() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) this.#state.addEdge({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input, mapFn: edge.mapFn });
    }
    this.assertParity();
    return this;
  }

  assertParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    const live = [];
    const shadow = [];
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) live.push(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
      for (const edge of this.#state.getEdges(track.id)) shadow.push(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
    }
    live.sort();
    shadow.sort();
    if (live.length !== shadow.length || live.some((key, index) => key !== shadow[index])) throw new Error("ObservationState is out of parity with live Track wiring.");
    return true;
  }

  /**
   * Composition parity, the evidence the P2-03 gate actually needs.
   *
   * assertParity() only proves the two sides hold the same edge set. That is not
   * enough to justify deleting the live Track observation state: two walkers can
   * agree on every edge and still merge them differently. They did. Output edges
   * were combined with a shallow spread on the shadow side and with mergePatches
   * on the live side, so any nested patch value composed to a different result
   * while wiring parity stayed green.
   */
  assertCompositionParity() {
    if (this.#destroyed) throw new Error("ObservationStateBridge is destroyed.");
    for (const track of this.#tracks.values()) {
      if (track.isDestroyed || typeof track.composeLocal !== "function" || typeof track.compose !== "function") continue;
      const live = track.compose();
      const shadow = this.#state.compose(track.id, undefined, new Map(), trackComposeLeaf);
      if (!patchesEqual(live, shadow)) throw new Error(`ObservationState composition differs from live Track composition for track '${track.id}'.`);
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
