import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Standalone observation ownership for one explicit scope.
 *
 * ProjectRuntime injects one instance across its standalone Tracks. Direct
 * Track callers get one adapter per Track by default, and cross-adapter edges
 * remain valid because the observer's adapter registers the source locally.
 * There is intentionally no module-global registry: ownership must die with
 * the runtime that created it.
 */
export class StandaloneObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #nextIdentity = 0;
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    this.#owner = new TrackObservationOwner({
      validateCycles: false,
      composeSource: (source, ctx) => source.compose(undefined, ctx),
    });
    const registry = tracks instanceof Map ? [...tracks.values()] : tracks;
    for (const track of registry) this.register(track);
  }

  get state() {
    return {
      tracks: new Map(this.#tracks),
      getEdges: (target) => this.#stateEdges(target),
      getSources: (target) => this.#stateSources(target),
      getObserverIds: (source) => this.getObserverIds(source),
    };
  }

  get isDestroyed() { return this.#destroyed; }
  get tracks() { return new Map(this.#tracks); }

  register(track) {
    this.#assertAlive();
    if (!track?.id) {
      throw new TypeError("StandaloneObservationAdapter requires a track with an id.");
    }
    if (this.#keys.has(track)) return track;
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

  getEdges(targetOrTrack) {
    const track = this.#resolveTrack(targetOrTrack);
    if (!track) return [];
    const target = this.#keys.get(track);
    return this.#owner.getEdges(target).map((edge) => ({
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
    return this.#owner.getObserverIds(this.#keys.get(source))
      .map((key) => this.#owner.getTrack(key)?.id)
      .filter(Boolean);
  }

  keyFor(track) {
    this.#assertAlive();
    this.register(track);
    return this.#keys.get(track);
  }

  clearObserved(observer) {
    if (this.#destroyed || !observer?.id) return;
    const target = this.#keys.get(observer);
    if (!target) return;
    for (const edge of this.#owner.getEdges(target)) {
      this.#owner.removeEdge({ source: edge.source, target, role: edge.role, input: edge.input });
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
    return this.#owner.compose(this.#keys.get(track), rawData, ctx);
  }

  destroy() {
    if (this.#destroyed) return;
    for (const track of [...this.#tracks.values()]) this.#unregister(track);
    this.#destroyed = true;
    this.#owner.destroy();
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
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
    this.#owner.removeSourceEdges(key);
    this.#owner.unregister(key);
    this.#tracks.delete(key);
    this.#keys.delete(track);
  }

  #stateEdges(targetOrTrack) {
    return this.getEdges(targetOrTrack);
  }

  #stateSources(targetOrTrack) {
    return this.getSources(targetOrTrack);
  }

  #resolveTrack(trackOrId) {
    return trackOrId && typeof trackOrId === "object"
      ? trackOrId
      : this.#findTrack(trackOrId);
  }

  #findTrack(id) {
    for (const track of this.#tracks.values()) {
      if (track.id === id) return track;
    }
    return null;
  }

  #watchTrack(track) {
    if (typeof track.onLifecycle === "function") {
      this.#lifecycleUnsubscribers.set(track, track.onLifecycle((event) => {
        if (event?.type === "detached") {
          this.#owner.removeSourceEdges(this.#keys.get(track));
        }
      }));
    }
    if (typeof track.onSourceDestroyed === "function") {
      this.#sourceUnsubscribers.set(track, track.onSourceDestroyed((event) => {
        const observerIds = this.getObserverIds(track);
        if (event && Array.isArray(event.observerIds)) {
          event.observerIds.splice(0, event.observerIds.length, ...observerIds);
        }
      }));
    }
  }

  #assertAlive() {
    if (this.#destroyed) {
      throw new Error("StandaloneObservationAdapter is destroyed.");
    }
  }
}
