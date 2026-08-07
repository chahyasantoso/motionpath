import { GraphRuntime } from "./GraphRuntime.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";

/**
 * Migration-only adapter. It wraps the existing TrackGroup/createGroupHost
 * owner, but owns no topology, playback, or graph semantics. The host remains
 * the behavior authority; this adapter only mirrors its current children into
 * the opt-in publisher runtime for shadow comparison.
 */
export class CompositeRuntime {
  #host;
  #runtime;
  #disposed = false;

  constructor(host, { clock = null } = {}) {
    if (!host || typeof host.getChild !== "function") throw new TypeError("CompositeRuntime requires a TrackGroup host.");
    this.#host = host;
    this.#runtime = null;
    this.#clock = clock;
  }

  get runtime() { return this.#runtime; }
  get isDisposed() { return this.#disposed; }
  get host() { return this.#host; }

  sync() {
    this.#assertAlive();
    const tracks = new Map();
    for (const id of this.#childIds()) {
      const track = this.#host.getChild(id);
      if (track) tracks.set(id, track);
    }
    const graph = normalizeObservationGraph({ tracks: [...tracks.keys()].map((id) => ({ id })) });
    this.#runtime?.dispose();
    this.#runtime = new GraphRuntime({ graph, tracks, clock: this.#clock });
    return this;
  }

  flush() { this.#assertAlive(); return this.#runtime?.flush() ?? 0; }
  shadow() {
    this.#assertAlive();
    const legacy = this.#host.composeGraph();
    const published = new Map([...this.#runtime?.patches.snapshot() ?? []].map(([id, patch]) => [id, patch.values]));
    return { legacy, published };
  }
  dispose() { if (this.#disposed) return; this.#disposed = true; this.#runtime?.dispose(); this.#runtime = null; this.#host = null; }
  #childIds() { return this.#host ? [...this.#host.graphOrder].filter((id) => this.#host.getChild(id)) : []; }
  #assertAlive() { if (this.#disposed) throw new Error("CompositeRuntime is disposed."); }
}
