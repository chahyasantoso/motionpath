import { TrackObservationOwner } from "./TrackObservationOwner.js";

const sharedOwner = new TrackObservationOwner({
  validateCycles: false,
  composeSource: (source, ctx) => (typeof source.compose === "function" ? source.compose(undefined, ctx) : sharedOwner.compose(source.id, undefined, ctx)),
});
let nextIdentity = 0;
const globalTracks = new Map();
const publicContexts = new WeakMap();
const internalContexts = new WeakSet();

/**
 * Standalone observation ownership for non-authored Track graphs.
 *
 * Public Track ids are motion-local and may repeat. The observation owner uses
 * private object identities instead, so qualified instances such as left/bone
 * and right/bone can coexist without leaking internal keys to callers.
 */
export class StandaloneObservationAdapter {
  #owner = sharedOwner;
  #keys = new WeakMap();
  #tracks = new Map();
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
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
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter requires a track with an id.");
    const existingKey = this.#keys.get(track);
    if (existingKey) return track;
    const key = `${track.id}#${++nextIdentity}`;
    this.#keys.set(track, key);
    this.#tracks.set(key, track);
    globalTracks.set(key, track);
    try {
      this.#owner.register(track, key);
    } catch (error) {
      globalTracks.delete(key);
      this.#tracks.delete(key);
      this.#keys.delete(track);
      throw error;
    }
    this.#watchTrack(track);
    return track;
  }

  unregister(trackOrId) {
    if (this.#destroyed) return;
    const track = typeof trackOrId === "object" ? trackOrId : this.#findTrack(trackOrId);
    const key = track ? this.#keys.get(track) : undefined;
    if (!key) return;
    this.#sourceUnsubscribers.get(track)?.();
    this.#sourceUnsubscribers.delete(track);
    this.#lifecycleUnsubscribers.get(track)?.();
    this.#lifecycleUnsubscribers.delete(track);
    this.#owner.unregister(key);
    globalTracks.delete(key);
    this.#tracks.delete(key);
    this.#keys.delete(track);
  }

  getEdges(targetOrId) {
    const track = this.#resolveTrack(targetOrId);
    if (!track) return [];
    const target = this.#keys.get(track);
    return this.#owner.getEdges(target).map((edge) => ({
      ...edge,
      source: globalTracks.get(edge.source.id) ?? edge.source,
      target: track.id,
    }));
  }

  getSources(targetOrId) {
    return this.getEdges(targetOrId).map(({ source }) => source).filter((source, index, sources) => sources.indexOf(source) === index);
  }

  getObserverIds(sourceOrTrack) {
    const source = this.#resolveTrack(sourceOrTrack);
    if (!source) return [];
    const key = this.#keys.get(source);
    return this.#owner.getObserverIds(key).map((observerKey) => globalTracks.get(observerKey)?.id).filter(Boolean);
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
    for (const edge of this.#owner.getEdges(target)) this.#owner.removeEdge({ source: edge.source.id, target, role: edge.role, input: edge.input });
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
    this.#owner.removeEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role, input: target });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(newSource);
    return this.#owner.replaceEdge(
      { source: this.#keys.get(oldSource), target: this.#keys.get(observer), role: opts.role },
      { source: this.#keys.get(newSource), target: this.#keys.get(observer), role: opts.role, input: opts.target, mapFn },
    );
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    this.register(track);
    const key = this.#keys.get(track);
    const internal = this.#internalContext(ctx);
    const patch = this.#owner.compose(key, rawData, internal);
    if (ctx && internal !== ctx) ctx.set(track.id, patch);
    return patch;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const track of [...this.#tracks.values()]) this.unregister(track);
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
  }

  #internalContext(ctx) {
    if (!ctx) return new Map();
    if (internalContexts.has(ctx)) return ctx;
    let internal = publicContexts.get(ctx);
    if (!internal) {
      internal = new Map();
      publicContexts.set(ctx, internal);
      internalContexts.add(internal);
      for (const [publicId, patch] of ctx) {
        const track = this.#resolveTrack(publicId);
        if (track) internal.set(this.#keys.get(track), patch);
      }
    }
    return internal;
  }

  #resolveTrack(trackOrId) {
    if (trackOrId && typeof trackOrId === "object") return trackOrId;
    return this.#findTrack(trackOrId);
  }

  #findTrack(id) {
    return [...globalTracks.values()].find((track) => track.id === id);
  }

  #watchTrack(track) {
    if (!track || this.#lifecycleUnsubscribers.has(track)) return;
    if (typeof track.onLifecycle === "function") this.#lifecycleUnsubscribers.set(track, track.onLifecycle((event) => { if (event?.type === "detached") this.#owner.removeSourceEdges(this.#keys.get(track)); }));
    if (typeof track.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(track, track.onSourceDestroyed((event) => { if (event && Array.isArray(event.observerIds)) event.observerIds.splice(0, event.observerIds.length, ...this.getObserverIds(track)); this.unregister(track); }));
  }

  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
