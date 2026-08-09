import { TrackObservationOwner } from "./TrackObservationOwner.js";
import { COMPOSING } from "./composeContext.js";

/**
 * Standalone observation ownership scoped to one caller-owned runtime.
 *
 * ProjectRuntime injects one adapter across its standalone Tracks. Direct Track
 * callers get a private adapter per Track; cross-adapter edges remain valid
 * because each observer adapter registers its source locally. No module-global
 * registry is used, so ownership cannot leak across runtimes or test cases.
 */
export class StandaloneObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
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
      getSources: (target) => this.getSources(target),
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
    const publicContext = ctx ?? new Map();
    const marker = publicContext.get(track.id);
    if (marker === COMPOSING) return track.composeLocal?.(rawData) ?? track.getSnapshot?.() ?? {};
    if (marker !== undefined) return marker;
    const internal = new Map();
    for (const [publicId, patch] of publicContext) {
      const known = this.#findTrack(publicId);
      if (known) internal.set(this.#keys.get(known), patch);
    }
    publicContext.set(track.id, COMPOSING);
    internal.set(this.#keys.get(track), COMPOSING);
    const patch = this.#owner.compose(this.#keys.get(track), rawData, internal);
    publicContext.set(track.id, patch);
    return patch;
  }

  destroy() {
    if (this.#destroyed) return;
    for (const track of [...this.#tracks.values()]) this.#unregister(track);
    this.#destroyed = true;
    this.#owner.destroy();
    this.#lifecycleUnsubscribers.clear();
  }

  #unregister(trackOrId) {
    const track = typeof trackOrId === "object"
      ? trackOrId
      : this.#findTrack(trackOrId);
    const key = track ? this.#keys.get(track) : undefined;
    if (!key) return;
    this.#lifecycleUnsubscribers.get(track)?.();
    this.#lifecycleUnsubscribers.delete(track);
    this.#owner.removeSourceEdges(key);
    this.#owner.unregister(key);
    this.#tracks.delete(key);
    this.#keys.delete(track);
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

  #composeSource(source, ctx) {
    if (typeof source.compose !== "function") {
      return this.#owner.compose(this.#keys.get(source), undefined, ctx);
    }
    const publicContext = new Map();
    for (const [key, patch] of ctx) {
      const track = this.#owner.getTrack(key);
      if (track) publicContext.set(track.id, patch);
    }
    return source.compose(undefined, publicContext);
  }

  #watchTrack(track) {
    if (typeof track.onLifecycle !== "function") return;
    this.#lifecycleUnsubscribers.set(track, track.onLifecycle((event) => {
      if (event?.type === "detached") {
        this.#owner.removeSourceEdges(this.#keys.get(track));
      }
    }));
  }

  #assertAlive() {
    if (this.#destroyed) {
      throw new Error("StandaloneObservationAdapter is destroyed.");
    }
  }
}
