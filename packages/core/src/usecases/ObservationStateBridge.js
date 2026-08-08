import { ObservationState } from "./ObservationState.js";

/**
 * P2-03 integration seam.
 *
 * Builds the new owned observation state from the existing live Track contract
 * and proves both representations describe the same edges. This is deliberately
 * a bridge, not a silent ownership switch: GraphBinding can use it to validate
 * parity before the next slice moves composition and mutation over.
 */
export class ObservationStateBridge {
  #tracks;
  #state;

  constructor({ tracks = new Map() } = {}) {
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#state = new ObservationState({ tracks: this.#tracks });
    this.syncFromTracks();
  }

  get state() { return this.#state; }
  get tracks() { return new Map(this.#tracks); }

  syncFromTracks() {
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) {
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

  assertParity() {
    const live = [];
    for (const track of this.#tracks.values()) {
      for (const edge of track.observedEdges ?? []) {
        live.push(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
      }
    }
    const shadow = [];
    for (const track of this.#tracks.values()) {
      for (const edge of this.#state.getEdges(track.id)) {
        shadow.push(this.#key({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input }));
      }
    }
    live.sort();
    shadow.sort();
    if (live.length !== shadow.length || live.some((key, index) => key !== shadow[index])) {
      throw new Error("ObservationState is out of parity with live Track wiring.");
    }
    return true;
  }

  destroy() {
    this.#state.destroy();
    this.#tracks.clear();
  }

  #key({ source, target, role = "output", input }) {
    return `${source}${target}${role}${input ?? ""}`;
  }
}
