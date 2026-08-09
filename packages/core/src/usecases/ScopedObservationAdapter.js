import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Scoped observation ownership.
 *
 * The same public adapter contract as `StandaloneObservationAdapter`, without the
 * module globals. Every identity key, registry entry and edge below belongs to
 * this instance, so two adapters can hold Tracks with the same public id and
 * never see each other's edges. That is the point: F-02 opened the hole that the
 * compatibility adapter closes with a process-wide shared owner, and this is the
 * replacement that does not need one.
 *
 * ## Why this looks like a copy of the compatibility adapter
 *
 * `ObservationAdapter.scenario-parity.test.js` runs one scenario set against both
 * adapters and compares the results, so the resemblance is load bearing. Four
 * things in particular were divergences, each caught by that runner:
 *
 * - **reads never register.** A read that registers turns `getEdges(unknown)`
 *   into a mutation and hides missing wiring behind an empty result.
 * - **`getSources` dedupes by Track identity, not public id.** Duplicate ids are
 *   legal inside one scope, and one source observed as both an input and an
 *   output is still one source.
 * - **the compose context is mirrored, not rebuilt.** The public context is keyed
 *   by public Track id, the owner is keyed by private identity, so the mirror is
 *   cached per public context. Rebuilding it per call re-composes shared
 *   upstreams once per hop and silently loses diamond memoization.
 * - **lifecycle is watched at registration.** `detached` drops the Track's
 *   outgoing edges, and the destroy snapshot is rewritten in place because a
 *   destroy subscriber reads `observerIds` before edge teardown.
 *
 * Still opt-in. `ProjectRuntime` only builds this when scoped ownership is
 * requested explicitly, and nothing constructs Tracks against it by default.
 */
export class ScopedObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
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

  /**
   * Legacy state surface, for the Track getters that still read it.
   *
   * `getSources` returns private keys on purpose. That is the internal-key half
   * of the contract; the public `getSources(track)` returns Track objects and
   * must never leak a key.
   */
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
    this.#owner.register(track, key);
    this.#watchTrack(track);
    return track;
  }

  unregister(trackOrId) {
    if (this.#destroyed) return;
    this.#unregister(trackOrId);
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
      // getEdges hands back Track objects; removeEdge matches on the private
      // key. Passing the Track straight through matches nothing.
      const source = this.#keys.get(edge.source);
      this.#owner.removeEdge({ source, target, role: edge.role, input: edge.input });
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

  /**
   * The old source is deliberately not registered here. An unknown old source
   * must fail as "does not observe", not quietly become a new scope member with
   * no edges.
   */
  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    this.#assertAlive();
    this.register(observer);
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
    // Unregister first, while the owner is still alive, so every lifecycle
    // subscription is released instead of being dropped on the floor.
    for (const track of [...this.#tracks.values()]) this.#unregister(track);
    this.#destroyed = true;
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
    this.#owner.destroy();
    this.#tracks.clear();
  }

  #unregister(trackOrId) {
    const track = typeof trackOrId === "object" ? trackOrId : this.#findTrack(trackOrId);
    const key = track ? this.#keys.get(track) : undefined;
    if (!key) return;
    this.#sourceUnsubscribers.get(track)?.();
    this.#sourceUnsubscribers.delete(track);
    this.#lifecycleUnsubscribers.get(track)?.();
    this.#lifecycleUnsubscribers.delete(track);
    this.#watched.delete(track);
    // Incoming and outgoing edges are two separate removals, and there is no
    // refcount: a scoped key belongs to one adapter, which is the whole point.
    this.#owner.removeSourceEdges(key);
    this.#owner.unregister(key);
    this.#tracks.delete(key);
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
    if (typeof source.compose === "function") return source.compose(undefined, ctx);
    const key = this.#keys.get(source);
    if (!key) return source.getSnapshot?.() ?? {};
    return this.#owner.compose(key, undefined, ctx);
  }

  #resolveTrack(trackOrId) {
    if (trackOrId && typeof trackOrId === "object") return trackOrId;
    return this.#findTrack(trackOrId);
  }

  #findTrack(id) {
    for (const track of this.#tracks.values()) {
      if (track.id === id) return track;
    }
    return null;
  }

  /**
   * Detach drops the Track's outgoing edges only. The destroy snapshot is
   * rewritten in place because subscribers read `observerIds` off the event
   * before the edges are torn down, so a fresh array would be ignored.
   */
  #watchTrack(track) {
    if (!track || this.#watched.has(track)) return;
    this.#watched.add(track);
    if (typeof track.onLifecycle === "function") {
      const unsubscribe = track.onLifecycle((event) => {
        if (event?.type === "detached") this.#owner.removeSourceEdges(this.#keys.get(track));
      });
      this.#lifecycleUnsubscribers.set(track, unsubscribe);
    }
    if (typeof track.onSourceDestroyed === "function") {
      const unsubscribe = track.onSourceDestroyed((event) => {
        if (!event || !Array.isArray(event.observerIds)) return;
        event.observerIds.splice(0, event.observerIds.length, ...this.getObserverIds(track));
      });
      this.#sourceUnsubscribers.set(track, unsubscribe);
    }
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("ScopedObservationAdapter is destroyed.");
  }
}
