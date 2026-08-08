import { composePatch } from "../usecases/ComposeTrackPatch.js";
import { COMPOSING } from "../usecases/composeContext.js";
import { mergePatches } from "../usecases/mergePatches.js";
import { observationEdgeKey } from "../usecases/observationEdge.js";
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
import { eventBus as defaultEventBus } from "./eventBus.js";
import { logger } from "./logger.js";

function clamp01(val) { return Math.max(0, Math.min(1, Number(val) || 0)); }

export class Track {
  #id; #mode; #interpolationTimeline; #proxyState; #plugins; #resolvedTrack; #eventBus;
  #host = null; #parent = null; #children = new Map(); #subscribers = new Set();
  #lifecycleSubscribers = new Set(); #destroySubscribers = new Set();
  #currentOffset = 0; #staggerOffset = 0; #layoutDelegate;
  #observed = new Map(); #observers = new Map(); #graphGuard = null;
  #groupHost = null; #destroyed = false;

  constructor({ id, mode = "standalone", interpolationTimeline, proxyState, plugins, resolvedTrack, layoutDelegate, eventBus = defaultEventBus }) {
    this.#id = id;
    this.#mode = mode === "authored-graph" ? "authored-graph" : "standalone";
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
    this.#eventBus = eventBus;
  }

  get id() { return this.#id; }
  get mode() { return this.#mode; }
  get currentOffset() { return this.#currentOffset; }
  get parent() { return this.#parent; }
  get duration() { return this.#interpolationTimeline?.duration() ?? 0; }
  get isDestroyed() { return this.#destroyed; }

  progress(p) {
    if (p === undefined) return this.#interpolationTimeline?.progress() ?? 0;
    if (this.#destroyed) return;
    this.#interpolationTimeline?.progress(clamp01(p));
    this.#notify();
    this.#invalidate("progress");
  }

  getSnapshot() {
    this.#assertAlive();
    const { _gsap, ...rest } = this.#proxyState || {};
    return { ...rest, progress: this.#interpolationTimeline?.progress() ?? 0 };
  }

  /**
   * Leaf composition: this track's own plugin output, with no observation edges
   * applied. Named so the edge walk can be owned by something other than Track.
   *
   * Pass-2 P2-03: ObservationState composes the graph and calls back into this
   * as its `composeLeaf`, which is what makes the two walkers comparable. Keep
   * this free of any observation state.
   */
  composeLocal(rawData) {
    this.#assertAlive();
    return composePatch(this.#plugins, rawData ?? this.getSnapshot(), this.#resolvedTrack, `track "${this.#id}"`);
  }

  compose(rawData, ctx) {
    this.#assertAlive();
    ctx = ctx ?? new Map();
    const cached = ctx.get(this.#id);
    if (cached === COMPOSING) return this.composeLocal(rawData);
    if (cached !== undefined) return cached;
    ctx.set(this.#id, COMPOSING);
    let source = rawData ?? this.getSnapshot();
    for (const { source: observedSource, mapFn, role } of this.#observed.values()) {
      if (role !== "input" || !mapFn) continue;
      const contribution = mapFn(observedSource.compose(undefined, ctx));
      if (contribution) source = { ...source, ...contribution };
    }
    let patch = this.composeLocal(source);
    for (const { source: observedSource, mapFn, role } of this.#observed.values()) {
      if (role !== "output" || !mapFn) continue;
      const observedPatch = mapFn(observedSource.compose(undefined, ctx));
      if (observedPatch) patch = mergePatches(patch, observedPatch);
    }
    ctx.set(this.#id, patch);
    return patch;
  }

  setObserved(track, mapFn, opts = {}) {
    if (!track) { this.#clearObserved(); return; }
    if (track === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    if (track.isDestroyed) throw new Error(`Track "${track.id}" is destroyed.`);
    const role = opts.role ?? "output";
    const input = role === "input" ? opts.target : undefined;
    this.#graphGuard?.(this, track, { role, input });
    const key = observationEdgeKey(track.id, role, input);
    const previous = this.#observed.get(key);
    if (previous) previous.source._removeObserver(this, key);
    this.#observed.set(key, { source: track, mapFn: mapFn ?? null, role, input });
    track._addObserver(this, key);
    this.#emitLifecycle({ type: previous ? "edge-replaced" : "edge-added", track: this, source: track, edge: { source: track.id, target: this.#id, role, input } });
    this.#invalidate("observation");
  }

  removeObserved(track, opts = {}) {
    if (!track) return;
    const keys = [...this.#observed.entries()].filter(([, edge]) => edge.source === track && (opts.role === undefined || edge.role === opts.role) && (opts.role !== "input" || opts.target === undefined || edge.input === opts.target)).map(([key]) => key);
    for (const key of keys) this.#removeObservedKey(key);
    if (keys.length) this.#invalidate("observation");
  }

  replaceObserved(oldSource, newSource, mapFn, opts = {}) {
    if (!oldSource || !newSource) throw new TypeError("replaceObserved requires old and new source tracks.");
    if (newSource === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    if (oldSource === newSource) throw new Error("replaceObserved requires two different source tracks.");
    const replaced = [...this.#observed.entries()].filter(([, edge]) => edge.source === oldSource && (opts.role === undefined || edge.role === opts.role)).map(([key, edge]) => ({ key, edge }));
    if (replaced.length === 0) throw new Error(`Track "${this.#id}" does not observe "${oldSource.id}".`);
    const additions = replaced.map(({ edge }) => { const role = edge.role; const input = role === "input" ? (opts.target ?? edge.input) : undefined; return { source: newSource, mapFn: mapFn ?? edge.mapFn, role, input, key: observationEdgeKey(newSource.id, role, input) }; });
    if (new Set(additions.map(({ key }) => key)).size !== additions.length) throw new Error("replaceObserved would collapse two edges into one.");
    for (const addition of additions) this.#graphGuard?.(this, newSource, { role: addition.role, input: addition.input, ignoring: replaced.map(({ key }) => key) });
    for (const { key } of replaced) this.#removeObservedKey(key);
    for (const addition of additions) {
      const previous = this.#observed.get(addition.key);
      if (previous) previous.source._removeObserver(this, addition.key);
      this.#observed.set(addition.key, { source: addition.source, mapFn: addition.mapFn, role: addition.role, input: addition.input });
      newSource._addObserver(this, addition.key);
      this.#emitLifecycle({ type: previous ? "edge-replaced" : "edge-added", track: this, source: addition.source, edge: { source: addition.source.id, target: this.#id, role: addition.role, input: addition.input } });
    }
    this.#invalidate("observation");
  }

  get observedSources() { return [...new Set([...this.#observed.values()].map(({ source }) => source))]; }
  get observedEdges() { return [...this.#observed.values()].map(({ source, mapFn, role, input }) => ({ source, mapFn, role, input, target: this.#id })); }
  get observerCount() { return this.#observers.size; }
  onLifecycle(callback) { if (typeof callback !== "function") throw new TypeError("Track lifecycle callback must be a function."); this.#lifecycleSubscribers.add(callback); return () => this.#lifecycleSubscribers.delete(callback); }
  onSourceDestroyed(callback) { if (typeof callback !== "function") throw new TypeError("Track destroy callback must be a function."); this.#destroySubscribers.add(callback); return () => this.#destroySubscribers.delete(callback); }
  subscribe(callback) { this.#subscribers.add(callback); callback(this.getSnapshot()); return () => this.#subscribers.delete(callback); }
  _setGraphGuard(guard) { this.#graphGuard = guard ?? null; }
  _addObserver(observer, key) { const keys = this.#observers.get(observer) ?? new Set(); keys.add(key); this.#observers.set(observer, keys); }
  _removeObserver(observer, key) { const keys = this.#observers.get(observer); if (!keys) return; keys.delete(key); if (!keys.size) this.#observers.delete(observer); }
  #notify() { const snapshot = this.getSnapshot(); for (const callback of this.#subscribers) callback(snapshot); }
  #emitLifecycle(event) { if (this.#destroyed && event.type !== "destroyed") return; for (const callback of [...this.#lifecycleSubscribers]) callback(event); }
  #invalidate(reason) { this.#emitLifecycle({ type: "invalidated", track: this, reason }); }
  #assertAlive() { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); }
  #removeObservedKey(key) { const edge = this.#observed.get(key); if (!edge) return; this.#observed.delete(key); edge.source._removeObserver(this, key); this.#emitLifecycle({ type: "edge-removed", track: this, source: edge.source, edge: { source: edge.source.id, target: this.#id, role: edge.role, input: edge.input } }); }
  #clearObserved() { const had = this.#observed.size > 0; for (const key of [...this.#observed.keys()]) this.#removeObservedKey(key); if (had) this.#invalidate("observation"); }
  #detachObservationEdges() { const affected = new Set(); for (const [observer, keys] of [...this.#observers]) { for (const key of [...keys]) observer.#removeObservedKey(key); affected.add(observer); } this.#observers.clear(); const hadObserved = this.#observed.size > 0; for (const key of [...this.#observed.keys()]) this.#removeObservedKey(key); for (const observer of affected) observer.#invalidate("observation"); if (hadObserved) this.#invalidate("observation"); }
  _mount(host) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (this.#host) throw new Error(`Track "${this.#id}" already mounted to "${this.#host.id ?? "another motion"}"`); this.#host = host; }
  _unmount() { this.#host = null; }
  get isMounted() { return this.#host !== null; }
  get childCount() { return this.#children.size; }
  getChild(id) { return this.#children.get(id) ?? null; }
  addChild(child, opts = {}) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (child.#parent) throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`); if (this.#children.has(child.id)) throw new Error(`Track "${this.#id}" already has a child with id "${child.id}".`); child.#parent = this; const stagger = opts.stagger ?? 0; child.#staggerOffset = stagger; const spawnOffset = this.#layoutDelegate.computeSpawnOffset(Array.from(this.#children.values()), { stagger }); child.#currentOffset = spawnOffset; this.#children.set(child.id, child); if (this.#host) this.#host._mountChild(child, spawnOffset); this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id }); this.#invalidate("children"); }
  removeChild(id) { const child = this.#children.get(id); if (!child) return; const siblings = Array.from(this.#children.values()); this.#children.delete(id); child.#parent = null; child.#detachObservationEdges(); if (this.#host) this.#host._unmountChild(child); for (const target of this.#layoutDelegate.computeReflow(siblings, child, {})) { target.child.#currentOffset = target.offset; if (this.#host) this.#host._reflowChild(target.child, target.offset); } child.#emitLifecycle({ type: "detached", track: child, parent: this }); this.#eventBus.emit("child:removing", { id: child.id, parentId: this.#id }); }
  _attachGroupHost(groupHost) { if (this.#groupHost) throw new Error(`Track "${this.#id}" is already a group host.`); this.#groupHost = groupHost; }
  play() { this.#groupHost?.timeline.play(); }
  pause() { this.#groupHost?.timeline.pause(); }
  seek(progress) { if (!this.#groupHost) return this.progress(progress); if (progress === undefined) return this.#groupHost.timeline.progress(); this.#groupHost.timeline.progress(clamp01(progress)); }
  reverse() { this.#groupHost?.timeline.reverse(); }
  destroy() { if (this.#destroyed) return; const observerIds = [...this.#observers.keys()].map((observer) => observer.id); this.#destroyed = true; this.#detachObservationEdges(); for (const child of this.#children.values()) child.destroy(); this.#children.clear(); this.#parent = null; this.#host = null; this.#subscribers.clear(); this.#graphGuard = null; const event = { id: this.#id, observerIds }; for (const callback of [...this.#destroySubscribers]) callback(event); this.#emitLifecycle({ type: "destroyed", track: this, observerIds: event.observerIds }); this.#destroySubscribers.clear(); this.#lifecycleSubscribers.clear(); if (this.#groupHost) { this.#groupHost.group.destroy(); this.#groupHost.timeline.kill(); this.#groupHost = null; } try { this.#interpolationTimeline?.kill(); } catch (e) { logger.warn(`track "${this.#id}", failed to kill interpolation timeline during destroy()`, e); } }
}
