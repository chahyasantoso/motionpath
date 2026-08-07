import { GraphRuntime } from "./GraphRuntime.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";

/** Migration-only adapter: the existing host remains the behavior authority. */
export class CompositeRuntime {
  #host; #runtime; #disposed = false; #tracks = new Map(); #clock;
  constructor(host, { clock = null } = {}) { if (!host || typeof host.getChild !== "function") throw new TypeError("CompositeRuntime requires a TrackGroup host."); this.#host = host; this.#clock = clock; }
  get runtime() { return this.#runtime; }
  get isDisposed() { return this.#disposed; }
  get host() { return this.#host; }
  register(track) { this.#assertAlive(); if (!track?.id) throw new TypeError("CompositeRuntime.register requires a Track."); this.#tracks.set(track.id, track); return this.sync(); }
  unregister(id) { this.#assertAlive(); this.#tracks.delete(id); return this.sync(); }
  sync() { this.#assertAlive(); const tracks = new Map([...this.#tracks].filter(([id]) => this.#host.getChild(id))); const graph = normalizeObservationGraph({ tracks: [...tracks.keys()].map((id) => ({ id })) }); this.#runtime?.dispose(); this.#runtime = new GraphRuntime({ graph, tracks, clock: this.#clock }); return this; }
  flush() { this.#assertAlive(); return this.#runtime?.flush() ?? 0; }
  shadow() {
    this.#assertAlive();
    const legacy = new Map();
    const composed = new Map();
    // TrackGroup.graphOrder is intentionally not the source of truth for a
    // dynamically spawned host: the host's order starts empty. The adapter's
    // explicit registration order is the live Spiral child set we shadow.
    for (const [id, registered] of this.#tracks) {
      const track = this.#host.getChild(id) ?? registered;
      if (track && !track.isDestroyed) legacy.set(id, track.compose(undefined, composed));
    }
    const published = new Map([...this.#runtime?.patches.snapshot() ?? []].map(([id, patch]) => [id, patch.values]));
    return { legacy, published };
  }
  dispose() { if (this.#disposed) return; this.#disposed = true; this.#runtime?.dispose(); this.#runtime = null; this.#tracks.clear(); this.#host = null; }
  #assertAlive() { if (this.#disposed) throw new Error("CompositeRuntime is disposed."); }
}
