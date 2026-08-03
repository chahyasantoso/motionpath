import { composePatch } from "../usecases/ComposeTrackPatch.js";
import { mergePatches } from "../usecases/mergePatches.js";
import { observationEdgeKey } from "../usecases/observationEdge.js";
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
import { eventBus as defaultEventBus } from "./eventBus.js";
import { logger } from "./logger.js";

function clamp01(val) { return Math.max(0, Math.min(1, Number(val) || 0)); }
const COMPOSING = Symbol("composing");

export class Track {
  #id; #interpolationTimeline; #proxyState; #plugins; #resolvedTrack; #eventBus;
  #host = null; #parent = null; #children = new Map(); #subscribers = new Set();
  #lifecycleSubscribers = new Set(); #currentOffset = 0; #staggerOffset = 0;
  #layoutDelegate; #observed = new Map(); #observers = new Map();
  #groupHost = null; #destroyed = false;

  constructor({ id, interpolationTimeline, proxyState, plugins, resolvedTrack, layoutDelegate, eventBus = defaultEventBus }) {
    this.#id = id;
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
    this.#eventBus = eventBus;
  }

  get id() { return this.#id; }
  get currentOffset() { return this.#currentOffset; }
  get parent() { return this.#parent; }
  get duration() { return this.#interpolationTimeline?.duration() ?? 0; }
  get isDestroyed() { return this.#destroyed; }

  progress(p) {
    if (p === undefined) return this.#interpolationTimeline?.progress() ?? 0;
    if (this.#destroyed) return;
    this.#interpolationTimeline?.progress(clamp01(p));
    this.#notify();
    this.#emitLifecycle({ type: "invalidated", track: this, reason: "progress" });
  }

  getSnapshot() {
    this.#assertAlive();
    const { _gsap, ...rest } = this.#proxyState || {};
    return { ...rest, progress: this.#interpolationTimeline?.progress() ?? 0 };
  }

  compose(rawData, ctx) {
    this.#assertAlive();
    ctx = ctx ?? new Map();
    const cached = ctx.get(this.#id);
    if (cached === COMPOSING) {
      return composePatch(this.#plugins, rawData ?? this.getSnapshot(), this.#resolvedTrack, `track "${this.#id}"`);
    }
    if (cached !== undefined) return cached;

    ctx.set(this.#id, COMPOSING);
    let source = rawData ?? this.getSnapshot();
    for (const { source: observedSource, mapFn, role } of this.#observed.values()) {
      if (role !== "input" || !mapFn) continue;
      const contribution = mapFn(observedSource.compose(undefined, ctx));
      if (contribution) source = { ...source, ...contribution };
    }
    let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
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
    const key = observationEdgeKey(track.id, role, input);
    const previous = this.#observed.get(key);
    if (previous) previous.source.#removeObserver(this, key);
    this.#observed.set(key, { source: track, mapFn: mapFn ?? null, role, input });
    track.#addObserver(this, key);
    this.#emitLifecycle({ type: previous ? "edge-replaced" : "edge-added", track: this, source: track, edge: { source: track.id, target: this.#id, role, input } });
    this.#emitLifecycle({ type: "invalidated", track: this, reason: "observation" });
  }

  removeObserved(track, opts = {}) {
    if (!track) return;
    const input = opts.role === "input" ? opts.target : undefined;
    const keys = [...this.#observed.entries()]
      .filter(([key, edge]) => edge.source === track && (opts.role === undefined || edge.role === opts.role) && (opts.role !== "input" || edge.input === input))
      .map(([key]) => key);
    for (const key of keys) this.#removeObservedKey(key);
    if (keys.length) this.#emitLifecycle({ type: "invalidated", track: this, reason: "observation" });
  }

  replaceObserved(oldSource, newSource, mapFn, opts = {}) {
    if (!oldSource || !newSource) throw new TypeError("replaceObserved requires old and new source tracks.");
    if (oldSource === newSource) throw new Error("replaceObserved requires different source tracks.");
    const oldEdges = [...this.#observed.values()].filter((edge) => edge.source === oldSource && (opts.role === undefined || edge.role === opts.role));
    if (oldEdges.length === 0) throw new Error(`Track "${this.#id}" does not observe "${oldSource.id}".`);
    if (newSource === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    const replacement = oldEdges.map((edge) => ({ ...edge, source: newSource, mapFn: mapFn ?? edge.mapFn, input: opts.role === "input" ? opts.target : edge.input }));
    const nextKeys = replacement.map((edge) => observationEdgeKey(edge.source.id, edge.role, edge.input));
    if (new Set(nextKeys).size !== nextKeys.length) throw new Error("replaceObserved would create duplicate observation edges.");
    for (const [key, edge] of this.#observed) if (edge.source === newSource && nextKeys.includes(key)) throw new Error("replaceObserved would overwrite an existing observation edge.");
    for (const edge of oldEdges) this.#removeObservedKey(this.#keyForEdge(edge));
    for (const edge of replacement) this.setObserved(edge.source, edge.mapFn, { role: edge.role, target: edge.input });
  }

  get observedSources() {
    return [...new Set([...this.#observed.values()].map(({ source }) => source))];
  }

  get observedEdges() {
    return [...this.#observed.values()].map(({ source, mapFn, role, input }) => ({ source, mapFn, role, input, target: this.#id }));
  }

  onLifecycle(callback) {
    if (typeof callback !== "function") throw new TypeError("Track lifecycle callback must be a function.");
    this.#lifecycleSubscribers.add(callback);
    return () => this.#lifecycleSubscribers.delete(callback);
  }

  subscribe(callback) { this.#subscribers.add(callback); callback(this.getSnapshot()); return () => this.#subscribers.delete(callback); }
  #notify() { const snapshot = this.getSnapshot(); for (const callback of this.#subscribers) callback(snapshot); }
  #emitLifecycle(event) { for (const callback of this.#lifecycleSubscribers) callback(event); }
  #assertAlive() { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); }
  #keyForEdge(edge) { return observationEdgeKey(edge.source.id, edge.role, edge.input); }
  #addObserver(observer, key) { const keys = this.#observers.get(observer) ?? new Set(); keys.add(key); this.#observers.set(observer, keys); }
  #removeObserver(observer, key) { const keys = this.#observers.get(observer); if (!keys) return; keys.delete(key); if (!keys.size) this.#observers.delete(observer); }
  #removeObservedKey(key) { const edge = this.#observed.get(key); if (!edge) return; this.#observed.delete(key); edge.source.#removeObserver(this, key); this.#emitLifecycle({ type: "edge-removed", track: this, source: edge.source, edge: { source: edge.source.id, target: this.#id, role: edge.role, input: edge.input } }); }
  #clearObserved() { for (const key of [...this.#observed.keys()]) this.#removeObservedKey(key); this.#emitLifecycle({ type: "invalidated", track: this, reason: "observation" }); }

  _mount(host) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (this.#host) throw new Error(`Track "${this.#id}" already mounted to "${this.#host.id ?? "another motion"}"`); this.#host = host; }
  _unmount() { this.#host = null; }
  get isMounted() { return this.#host !== null; }
  get childCount() { return this.#children.size; }
  getChild(id) { return this.#children.get(id) ?? null; }

  addChild(child, opts = {}) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (child.#parent) throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`); if (this.#children.has(child.id)) throw new Error(`Track "${this.#id}" already has a child with id "${child.id}".`); child.#parent = this; const stagger = opts.stagger ?? 0; child.#staggerOffset = stagger; const spawnOffset = this.#layoutDelegate.computeSpawnOffset(Array.from(this.#children.values()), { stagger }); child.#currentOffset = spawnOffset; this.#children.set(child.id, child); if (this.#host) this.#host._mountChild(child, spawnOffset); this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id }); this.#emitLifecycle({ type: "invalidated", track: this, reason: "children" }); }
  removeChild(id) { const child = this.#children.get(id); if (!child) return; const siblings = Array.from(this.#children.values()); this.#children.delete(id); child.#parent = null; if (this.#host) this.#host._unmountChild(child); for (const target of this.#layoutDelegate.computeReflow(siblings, child, {})) { target.child.#currentOffset = target.offset; if (this.#host) this.#host._reflowChild(target.child, target.offset); } this.#eventBus.emit("child:removing", { id: child.id, parentId: this.#id }); this.#emitLifecycle({ type: "invalidated", track: this, reason: "children" }); }
  _attachGroupHost(groupHost) { if (this.#groupHost) throw new Error(`Track "${this.#id}" is already a group host.`); this.#groupHost = groupHost; }
  play() { this.#groupHost?.timeline.play(); }
  pause() { this.#groupHost?.timeline.pause(); }
  seek(progress) { if (!this.#groupHost) return this.progress(progress); if (progress === undefined) return this.#groupHost.timeline.progress(); this.#groupHost.timeline.progress(clamp01(progress)); }
  reverse() { this.#groupHost?.timeline.reverse(); }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const [observer, keys] of [...this.#observers]) for (const key of [...keys]) observer.#removeObservedKey(key);
    this.#observers.clear();
    this.#clearObserved();
    for (const child of this.#children.values()) child.destroy();
    this.#children.clear();
    this.#parent = null; this.#host = null; this.#subscribers.clear();
    this.#emitLifecycle({ type: "destroyed", track: this });
    this.#lifecycleSubscribers.clear();
    if (this.#groupHost) { this.#groupHost.group.destroy(); this.#groupHost.timeline.kill(); this.#groupHost = null; }
    try { this.#interpolationTimeline?.kill(); } catch (e) { logger.warn(`track "${this.#id}"`, "failed to kill the interpolation timeline during destroy()", e); }
  }
}
