import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Explicit standalone observation ownership for non-authored Track graphs.
 *
 * Authored graphs use `GraphBinding`. Standalone mutual observation is a
 * separate, supported capability and must not be smuggled back into Track as a
 * second graph implementation. This adapter gives that mode the same
 * `ObservationState` machinery with cycle validation off, because a standalone
 * back-edge is legal.
 *
 * ## Open finding F-02, adapter scope
 *
 * An adapter is meant to be SHARED by every Track that can observe another.
 * Since #139, `createTrack` and the `Track` constructor each fall back to
 * creating one per Track, and this class papers over that by auto-registering
 * both endpoints on first mutation. The consequence is that the observer's
 * adapter becomes the de-facto owner of an edge while the source's own adapter
 * keeps an empty view of its observers, so `getObserverIds` is only correct on
 * one of the two. Decide the scope, one adapter per Motion or per
 * ProjectRuntime, and inject it before deleting Track's observation state.
 */
export class StandaloneObservationAdapter {
  #owner;
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    const registry = tracks instanceof Map ? tracks : new Map(tracks.map((track) => [track.id, track]));
    this.#owner = new TrackObservationOwner({
      tracks: registry,
      validateCycles: false,
      // Bound through a method rather than reading `this.#owner` inline: the
      // original form referenced the field it was being assigned to, which
      // worked only because the closure is deferred.
      composeSource: (source, ctx) => this.#composeSource(source, ctx),
    });
    for (const track of registry.values()) this.#watchTrack(track);
  }

  get state() {
    return this.#owner.state;
  }
  get isDestroyed() {
    return this.#destroyed;
  }
  get tracks() {
    return this.#owner.tracks;
  }

  register(track) {
    this.#assertAlive();
    const registered = this.#owner.register(track);
    this.#watchTrack(registered);
    return registered;
  }

  unregister(id) {
    if (this.#destroyed) return;
    this.#sourceUnsubscribers.get(id)?.();
    this.#sourceUnsubscribers.delete(id);
    this.#lifecycleUnsubscribers.get(id)?.();
    this.#lifecycleUnsubscribers.delete(id);
    this.#owner.unregister(id);
  }

  clearObserved(observer) {
    if (this.#destroyed || !observer?.id) return;
    for (const edge of this.#owner.getEdges(observer.id)) {
      this.#owner.removeEdge({
        source: edge.source.id,
        target: observer.id,
        role: edge.role,
        input: edge.input,
      });
    }
  }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#assertAlive();
    if (!observer?.id || !source?.id) {
      throw new TypeError("StandaloneObservationAdapter.setObserved requires two tracks.");
    }
    // Adopting both endpoints is what makes a direct `new Track()` pair work.
    // See F-02: it is a workaround for per-Track adapters, not the design.
    this.register(observer);
    this.register(source);
    return this.#owner.addEdge({
      source: source.id,
      target: observer.id,
      role,
      input: role === "input" ? (target ?? observer.id) : undefined,
      mapFn: mapFn ?? null,
    });
  }

  removeObserved(observer, source, { role, target } = {}) {
    if (this.#destroyed || !observer?.id || !source?.id) return;
    this.#owner.removeEdge({ source: source.id, target: observer.id, role, input: target });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, { role, target } = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(newSource);
    return this.#owner.replaceEdge(
      { source: oldSource.id, target: observer.id, role },
      { source: newSource.id, target: observer.id, role, input: target, mapFn },
    );
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter.compose requires a track.");
    this.register(track);
    return this.#owner.compose(track.id, rawData, ctx);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#sourceUnsubscribers.values()) unsubscribe();
    for (const unsubscribe of this.#lifecycleUnsubscribers.values()) unsubscribe();
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
    this.#owner.destroy();
  }

  // A source that owns its own Track composes through it, so its adapter and
  // any injected composer still apply. Otherwise compose it from this state.
  #composeSource(source, ctx) {
    if (typeof source.compose === "function") return source.compose(undefined, ctx);
    return this.#owner.compose(source.id, undefined, ctx);
  }

  /**
   * Lifecycle wiring per registered Track.
   *
   * `detached` drops the edges that pointed AT this track, so surviving
   * dependents stop reading a source that left the graph.
   *
   * `onSourceDestroyed` reports the observer ids back to the destroying Track by
   * splicing the caller's array in place. That in-place return channel is
   * finding F-02: with more than one adapter subscribed, which adapter wins
   * depends on destroy-subscriber iteration order. It should become a returned
   * value once adapter scope is decided.
   */
  #watchTrack(track) {
    if (!track || this.#lifecycleUnsubscribers.has(track.id)) return;
    if (typeof track.onLifecycle === "function") {
      this.#lifecycleUnsubscribers.set(
        track.id,
        track.onLifecycle((event) => {
          if (event?.type === "detached") this.#owner.removeSourceEdges(track.id);
        }),
      );
    }
    if (typeof track.onSourceDestroyed === "function") {
      this.#sourceUnsubscribers.set(
        track.id,
        track.onSourceDestroyed((event) => {
          if (event && Array.isArray(event.observerIds)) {
            const observerIds = this.#owner.getObserverIds(track.id);
            event.observerIds.splice(0, event.observerIds.length, ...observerIds);
          }
          this.unregister(track.id);
        }),
      );
    }
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed.");
  }
}
