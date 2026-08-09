import { TrackObservationOwner } from "./TrackObservationOwner.js";

/** Standalone observation ownership with private identity keys and public Track objects. */
export class StandaloneObservationAdapter {
  #owner;
  #keys = new WeakMap();
  #tracks = new Map();
  #nextIdentity = 0;
  #sourceUnsubscribers = new Map();
  #lifecycleUnsubscribers = new Map();
  #destroyed = false;

  constructor({ tracks = [] } = {}) {
    this.#owner = new TrackObservationOwner({
      validateCycles: false,
      composeSource: (source, ctx) => {
        if (typeof source.compose === "function") return source.compose(undefined, ctx);
        return this.#owner.compose(this.#keys.get(source), undefined, ctx);
      },
    });
    const registry = tracks instanceof Map ? [...tracks.values()] : tracks;
    for (const track of registry) this.register(track);
  }

  get state() {
    return {
      tracks: new Map(this.#tracks),
      getEdges: (target) => this.#owner.getEdges(this.#keyForPublic(target)),
      getSources: (target) => this.#owner.getSources(this.#keyForPublic(target)),
      getObserverIds: (source) => this.#owner.getObserverIds(this.#keyForPublic(source)),
    };
  }
  get isDestroyed() { return this.#destroyed; }
  get tracks() { return new Map(this.#tracks); }

  register(track) {
    this.#assertAlive();
    if (!track?.id) throw new TypeError("StandaloneObservationAdapter requires a track with an id.");
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
    const track = typeof trackOrId === "object" ? trackOrId : this.#findById(trackOrId);
    if (!track) return;
    const key = this.#keys.get(track);
    if (!key) return;
    this.#sourceUnsubscribers.get(track)?.();
    this.#sourceUnsubscribers.delete(track);
    this.#lifecycleUnsubscribers.get(track)?.();
    this.#lifecycleUnsubscribers.delete(track);
    this.#owner.unregister(key);
    this.#tracks.delete(key);
    this.#keys.delete(track);
  }

  getEdges(targetOrTrack) {
    const track = this.#resolveTrack(targetOrTrack);
    if (!track) return [];
    return this.#owner.getEdges(this.#keys.get(track)).map((edge) => ({ ...edge, target: track.id }));
  }

  getSources(targetOrTrack) {
    const sources = this.getEdges(targetOrTrack).map(({ source }) => source);
    return sources.filter((source, index) => sources.indexOf(source) === index);
  }

  getObserverIds(sourceOrTrack) {
    const source = this.#resolveTrack(sourceOrTrack);
    if (!source) return [];
    return this.#owner.getObserverIds(this.#keys.get(source)).map((key) => this.#tracks.get(key)?.id).filter(Boolean);
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
    return this.#owner.addEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role, input: role === "input" ? (target ?? observer.id) : undefined, mapFn: mapFn ?? null });
  }

  removeObserved(observer, source, { role, target } = {}) {
    if (this.#destroyed || !observer?.id || !source?.id) return;
    this.#owner.removeEdge({ source: this.#keys.get(source), target: this.#keys.get(observer), role, input: target });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    this.#assertAlive();
    this.register(observer);
    this.register(newSource);
    return this.#owner.replaceEdge({ source: this.#keys.get(oldSource), target: this.#keys.get(observer), role: opts.role }, { source: this.#keys.get(newSource), target: this.#keys.get(observer), role: opts.role, input: opts.target, mapFn });
  }

  compose(track, rawData, ctx) {
    this.#assertAlive();
    this.register(track);
    return this.#owner.compose(this.#keys.get(track), rawData, ctx);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#sourceUnsubscribers.values()) unsubscribe();
    for (const unsubscribe of this.#lifecycleUnsubscribers.values()) unsubscribe();
    this.#sourceUnsubscribers.clear();
    this.#lifecycleUnsubscribers.clear();
    this.#owner.destroy();
    this.#tracks.clear();
  }

  #keyForPublic(value) {
    const track = this.#resolveTrack(value);
    return track ? this.#keys.get(track) : value;
  }
  #resolveTrack(value) { return value && typeof value === "object" ? value : this.#findById(value); }
  #findById(id) { return [...this.#tracks.values()].find((track) => track.id === id); }
  #watchTrack(track) {
    if (!track || this.#lifecycleUnsubscribers.has(track)) return;
    if (typeof track.onLifecycle === "function") this.#lifecycleUnsubscribers.set(track, track.onLifecycle((event) => { if (event?.type === "detached") this.#owner.removeSourceEdges(this.#keys.get(track)); }));
    if (typeof track.onSourceDestroyed === "function") this.#sourceUnsubscribers.set(track, track.onSourceDestroyed((event) => { if (event && Array.isArray(event.observerIds)) event.observerIds.splice(0, event.observerIds.length, ...this.getObserverIds(track)); this.unregister(track); }));
  }
  #assertAlive() { if (this.#destroyed) throw new Error("StandaloneObservationAdapter is destroyed."); }
}
