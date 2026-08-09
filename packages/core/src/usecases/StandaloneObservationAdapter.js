import { TrackObservationOwner } from "./TrackObservationOwner.js";

let nextIdentity = 0;
const globalTracks = new Map();
const globalKeys = new WeakMap();
const publicContexts = new WeakMap();
const internalContexts = new WeakSet();
const sharedOwner = new TrackObservationOwner({
  validateCycles: false,
  composeSource: (source, ctx) => (typeof source.compose === "function" ? source.compose(undefined, ctx) : sharedOwner.compose(globalKeys.get(source), undefined, ctx)),
});

/** Standalone observation ownership with private identity keys and public Track ids. */
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

  get state() { return { tracks: new Map(this.#tracks), getEdges: (target) => this.getEdges(target), getSources: (target) => this.getSources(target), getObserverIds: (source) => this.getObserverIds(source) }; }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return new Map(this.#tracks); }

  register(track) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter requires a track with an id.");
    const existingKey = this.#keys.get(track);
    if (existingKey) return track;
    const key = `${track.id}#${++nextIdentity}`;
    this.#keys.set(track, key); globalKeys.set(track, key); this.#tracks.set(key, track); globalTracks.set(key, track);
    try { this.#owner.register(track, key); } catch (error) { globalTracks.delete(key); globalKeys.delete(track); this.#tracks.delete(key); this.#keys.delete(track); throw error; }
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
    return this.#owner.getEdges(target).map((edge) => ({ ...edge, source: edge.source, target: track.id }));
  }

  getSources(targetOrTrack) {
    return this.getEdges(targetOrTrack).map(({ source }) => source.id).filter((id, index, ids) => ids.indexOf(id) === index);
  }

  getObserverIds(sourceOrTrack) {
    const source = this.#resolveTrack(sourceOrTrack);
    if (!source) return [];
    return this.#owner.getObserverIds(this.#keys.get(source)).map((key) => globalTracks.get(key)?.id).filter(Boolean);
  }

  keyFor(track) { this.#assertAlive(); this.register(track); return this.#keys.get(track); }
  clearObserved(observer) { if (this.#destroyed || !observer?.id) return; const target = this.#keys.get(observer); if (!target) return; for (const edge of this.#owner.getEdges(target)) this.#owner.removeEdge({ source: edge.source.id, target, role: edge.role, input: edge.input }); }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#assertAlive(); this.register(observer); this.register(source);
    return this.#owner.addEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role, input: role === "input" ? (target ?? observer.id) : undefined, mapFn: mapFn ?? null });
  }

  removeObserved(observer, source, { role, target } = {}) { if (this.#destroyed || !observer?.id || !source?.id) return; this.#owner.removeEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role, input: target }); }
  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) { this.#assertAlive(); this.register(observer); this.register(newSource); return this.#owner.replaceEdge({ source: this.#keys.get(oldSource), target: this.#keys.get(observer), role: opts.role }, { source: this.#keys.get(newSource), target: this.#keys.get(observer), role: opts.role, input: opts.target, mapFn }); }

  compose(track, rawData, ctx) {
    this.#assertAlive(); this.register(track);
    const internal = this.#internalContext(ctx); const patch = this.#owner.compose(this.#keys.get(track), rawData, internal);
    if (ctx && internal !== ctx) ctx.set(track.id, patch);
    return patch;
  }

  destroy() {
    if (this.#destroyed) return;
    for (const track of [...this.#tracks.values()]) this.#unregister(track);
    this.#destroyed = true;
    this.#sourceUnsubscribers.clear(); this.#lifecycleUnsubscribers.clear();
  }

  #unregister(trackOrId) {
    const track = typeof trackOrId === "object" ? trackOrId : this.#findTrack(trackOrId);
    const key = track ? this.#keys.get(track) : undefined;
    if (!key) return;
    this.#sourceUnsubscribers.get(track)?.(); this.#sourceUnsubscribers.delete(track);
    this.#lifecycleUnsubscribers.get(track)?.(); this.#lifecycleUnsubscribers.delete(track);
    this.#owner.unregister(key); globalTracks.delete(key); globalKeys.delete(track); this.#tracks.delete(key); this.#keys.delete(track);
  }

  #internalContext(ctx) {
    if (!ctx) return new Map();
    if (internalContexts.has(ctx)) return ctx;
    let internal = publicContexts.get(ctx);
    if (!internal) {
      internal = new Map(); publicContexts.set(ctx, internal); internalContexts.add(internal);
      for (const [publicId, patch] of ctx) { const track = this.#findTrack(publicId); if (track) internal.set(globalKeys.get(track), patch); }
    }
    return internal;
  }

  #resolveTrack(trackOrId) { return trackOrId && typeof trackOrId === "object" ? trackOrId : this.#findTrack(trackOrId); }
  #findTrack(id) { return [...globalTracks.values()].find((track) => track.id === id); }
  #watchTrack(track) { if (!track || this.#lifecycleUnsubscribers.has(track)) return; if (typeof track.onLifecycle === "function") this.#lifecycleUnsubscribers.set(track, track.onLifecycle((event) => { if (event?.type === "detached") this.#owner.removeSourceEdges(this.#keys.get(track)); })); if (typeof track.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(track, track.onSourceDestroyed((event) => { if (event && Array.isArray(event.observerIds)) event.observerIds.splice(0, event.observerIds.length, ...this.getObserverIds(track)); this.#unregister(track); })); }
  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
