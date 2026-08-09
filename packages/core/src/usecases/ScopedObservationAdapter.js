import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Scoped observation ownership without module globals. Each adapter owns its
 * identity space, while public-ID lookup keeps first-registration semantics.
 *
 * Private keys are the owner boundary. Public Track IDs remain the compatibility
 * boundary, so callers never receive private identity tokens from reads.
 *
 * The separate ID index is intentional: fuzz and publish paths resolve tracks on
 * every composition hop, and scanning the full registry turns that hot path into
 * avoidable O(registry) work.
 *
 * Compose contexts are mirrored once per public context. This preserves shared
 * ancestor memoization while allowing the owner to use private identity keys.
 *
 * Lifecycle subscriptions are released before owner entries disappear. Source
 * destruction therefore reports observers from live state, then removes both
 * incoming and outgoing edges without leaving stale registry references.
 */
export class ScopedObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
  #tracksById = new Map();
  #contextMirrors = new WeakMap();
  #internalContexts = new WeakSet();
  #watched = new WeakSet();
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #nextIdentity = 0;
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    this.#owner = new TrackObservationOwner({
      validateCycles: false,
      composeSource: (source, ctx) => this.#composeSource(source, ctx),
    });
    const registry = tracks instanceof Map ? [...tracks.values()] : tracks;
    for (const track of registry) this.register(track);
  }

  get state() {
    return {
      tracks: new Map(this.#tracks),
      getEdges: (target) => this.getEdges(target),
      getSources: (target) => this.#stateSources(target),
      getObserverIds: (source) => this.getObserverIds(source),
    };
  }

  get isDestroyed() {
    return this.#destroyed;
  }

  get tracks() {
    return new Map(this.#tracks);
  }

  register(track) {
    this.#assertAlive();
    if (!track?.id) {
      throw new TypeError("ScopedObservationAdapter requires a track with an id.");
    }
    if (this.#keys.has(track)) {
      this.#watchTrack(track);
      return track;
    }
    const key = `${track.id}#${++this.#nextIdentity}`;
    this.#keys.set(track, key);
    this.#tracks.set(key, track);
    if (!this.#tracksById.has(track.id)) {
      this.#tracksById.set(track.id, track);
    }
    this.#owner.register(track, key);
    this.#watchTrack(track);
    return track;
  }

  unregister(trackOrId) {
    if (!this.#destroyed) this.#unregister(trackOrId);
  }

  keyFor(track) {
    this.#assertAlive();
    this.register(track);
    return this.#keys.get(track);
  }

  getEdges(targetOrTrack) {
    const track = this.#resolveTrack(targetOrTrack);
    if (!track) return [];
    return this.#owner.getEdges(this.#keys.get(track)).map((edge) => ({
      ...edge,
      source: this.#owner.getTrack(edge.source) ?? edge.source,
      target: track.id,
    }));
  }

  getSources(targetOrTrack) {
    const seen = new Set();
    return this.getEdges(targetOrTrack)
      .map(({ source }) => source)
      .filter((source) => {
        if (seen.has(source)) return false;
        seen.add(source);
        return true;
      });
  }

  getObserverIds(sourceOrTrack) {
    const source = this.#resolveTrack(sourceOrTrack);
    if (!source) return [];
    return this.#owner
      .getObserverIds(this.#keys.get(source))
      .map((key) => this.#owner.getTrack(key)?.id)
      .filter(Boolean);
  }

  clearObserved(observer) {
    if (this.#destroyed || !observer?.id) return;
    const target = this.#keys.get(observer);
    if (!target) return;
    for (const edge of this.#owner.getEdges(target)) {
      this.#owner.removeEdge({
        source: this.#keys.get(edge.source),
        target,
        role: edge.role,
        input: edge.input,
      });
    }
  }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(source);
    return this.#owner.addEdge({
      source: this.#keys.get(source),
      target: this.#keys.get(observer),
      role,
      input: role === "input" ? (target ?? observer.id) : undefined,
      mapFn: mapFn ?? null,
    });
  }

  removeObserved(observer, source, { role, target } = {}) {
    if (this.#destroyed || !observer?.id || !source?.id) return;
    this.#owner.removeEdge({
      source: this.#keys.get(source),
      target: this.#keys.get(observer),
      role,
      input: target,
    });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(oldSource);
    this.register(newSource);
    return this.#owner.replaceEdge(
      {
        source: this.#keys.get(oldSource),
        target: this.#keys.get(observer),
        role: opts.role,
      },
      {
        source: this.#keys.get(newSource),
        target: this.#keys.get(observer),
        role: opts.role,
        input: opts.target,
        mapFn,
      },
    );
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    this.register(track);
    const internal = this.#internalContext(ctx);
    const patch = this.#owner.compose(this.#keys.get(track), rawData, internal);
    if (ctx && internal !== ctx) ctx.set(track.id, patch);
    return patch;
  }

  destroy() {
    if (this.#destroyed) return;
    for (const track of [...this.#tracks.values()]) this.#unregister(track);
    this.#destroyed = true;
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
    this.#owner.destroy();
    this.#tracks.clear();
    this.#tracksById.clear();
  }

  #unregister(trackOrId) {
    const track = typeof trackOrId === "object"
      ? trackOrId
      : this.#findTrack(trackOrId);
    const key = track ? this.#keys.get(track) : undefined;
    if (!key) return;
    this.#sourceUnsubscribers.get(track)?.();
    this.#sourceUnsubscribers.delete(track);
    this.#lifecycleUnsubscribers.get(track)?.();
    this.#lifecycleUnsubscribers.delete(track);
    this.#watched.delete(track);
    this.#owner.removeSourceEdges(key);
    this.#owner.unregister(key);
    this.#tracks.delete(key);
    if (this.#tracksById.get(track.id) === track) {
      this.#tracksById.delete(track.id);
      for (const candidate of this.#tracks.values()) {
        if (candidate.id === track.id) {
          this.#tracksById.set(track.id, candidate);
          break;
        }
      }
    }
    this.#keys.delete(track);
  }

  #stateSources(targetOrTrack) {
    const track = this.#resolveTrack(targetOrTrack);
    return track ? this.#owner.getSources(this.#keys.get(track)) : [];
  }

  #internalContext(ctx) {
    if (!ctx) return new Map();
    if (this.#internalContexts.has(ctx)) return ctx;
    const cached = this.#contextMirrors.get(ctx);
    if (cached) return cached;
    const internal = new Map();
    this.#contextMirrors.set(ctx, internal);
    this.#internalContexts.add(internal);
    for (const [publicId, patch] of ctx) {
      const track = this.#findTrack(publicId);
      if (track) internal.set(this.#keys.get(track), patch);
    }
    return internal;
  }

  #composeSource(source, ctx) {
    const key = this.#keys.get(source);
    if (key) return this.#owner.compose(key, undefined, ctx);
    return source?.getSnapshot?.() ?? {};
  }

  #resolveTrack(trackOrId) {
    return trackOrId && typeof trackOrId === "object"
      ? trackOrId
      : this.#findTrack(trackOrId);
  }

  #findTrack(id) {
    return this.#tracksById.get(id) ?? null;
  }

  #watchTrack(track) {
    if (!track || this.#watched.has(track)) return;
    this.#watched.add(track);
    if (typeof track.onLifecycle === "function") {
      this.#lifecycleUnsubscribers.set(
        track,
        track.onLifecycle((event) => {
          if (event?.type === "detached") {
            this.#owner.removeSourceEdges(this.#keys.get(track));
          }
        }),
      );
    }
    if (typeof track.onSourceDestroyed === "function") {
      this.#sourceUnsubscribers.set(
        track,
        track.onSourceDestroyed((event) => {
          if (!event || !Array.isArray(event.observerIds)) return;
          event.observerIds.splice(
            0,
            event.observerIds.length,
            ...this.getObserverIds(track),
          );
        }),
      );
    }
  }

  #assertAlive() {
    if (this.#destroyed) {
      throw new Error("ScopedObservationAdapter is destroyed.");
    }
  }
}
