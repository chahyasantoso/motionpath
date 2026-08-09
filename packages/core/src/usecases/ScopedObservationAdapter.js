import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Scoped owner harness with the same public adapter contract.
 *
 * This intentionally preserves the compatibility protocol while ownership is
 * local to this instance. It is opt-in and not wired into Track yet; the next
 * integration slice can compare it with StandaloneObservationAdapter before
 * changing ProjectRuntime behavior.
 */
export class ScopedObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
  #nextIdentity = 0;
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    this.#owner = new TrackObservationOwner({
      validateCycles: false,
      composeSource: (source, ctx) => source.compose(undefined, ctx),
    });
    for (const track of tracks instanceof Map ? tracks.values() : tracks) {
      this.register(track);
    }
  }

  get isDestroyed() { return this.#destroyed; }
  get tracks() { return new Map(this.#tracks); }

  register(track) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("ScopedObservationAdapter requires a track.");
    if (this.#keys.has(track)) return track;
    const key = `${track.id}#${++this.#nextIdentity}`;
    this.#keys.set(track, key);
    this.#tracks.set(key, track);
    this.#owner.register(track, key);
    return track;
  }

  getEdges(track) {
    this.register(track);
    return this.#owner.getEdges(this.#keys.get(track)).map((edge) => ({
      ...edge,
      source: this.#owner.getTrack(edge.source),
      target: track.id,
    }));
  }

  getSources(track) {
    return this.getEdges(track).map(({ source }) => source);
  }

  setObserved(observer, source, mapFn, options = {}) {
    this.register(observer);
    this.register(source);
    return this.#owner.addEdge({
      source: this.#keys.get(source),
      target: this.#keys.get(observer),
      role: options.role ?? "output",
      input: options.role === "input" ? (options.target ?? observer.id) : undefined,
      mapFn: mapFn ?? null,
    });
  }

  compose(track, rawData, context) {
    this.#assertAlive();
    this.register(track);
    const ctx = context ?? new Map();
    const internal = new Map();
    for (const [publicId, patch] of ctx) {
      const known = [...this.#tracks.values()].find((candidate) => candidate.id === publicId);
      if (known) internal.set(this.#keys.get(known), patch);
    }
    const patch = this.#owner.compose(this.#keys.get(track), rawData, internal);
    if (context) context.set(track.id, patch);
    return patch;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#owner.destroy();
    this.#tracks.clear();
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("ScopedObservationAdapter is destroyed.");
  }
}
