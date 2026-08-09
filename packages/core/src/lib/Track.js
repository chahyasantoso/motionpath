import { composePatch } from "../usecases/ComposeTrackPatch.js";
import { createDestroyEvent } from "../usecases/LegacyObservationFacade.js";
import { StandaloneObservationAdapter } from "../usecases/StandaloneObservationAdapter.js";
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
import { eventBus as defaultEventBus } from "./eventBus.js";
import { logger } from "./logger.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * Track is a playhead and local plugin composer. Observation graph state lives
 * in the injected owner, not in this leaf object. Compatibility observation is
 * installed by explicit adapters, never during Track construction.
 */
export class Track {
  #id;
  #mode;
  #interpolationTimeline;
  #proxyState;
  #plugins;
  #resolvedTrack;
  #eventBus;
  #host = null;
  #parent = null;
  #children = new Map();
  #subscribers = new Set();
  #lifecycleSubscribers = new Set();
  #destroySubscribers = new Set();
  #currentOffset = 0;
  #staggerOffset = 0;
  #layoutDelegate;
  #standaloneObservationAdapter;
  #observationController = null;
  #groupHost = null;
  #destroyed = false;
  #destroying = false;

  constructor({ id, mode = "standalone", interpolationTimeline, proxyState, plugins, resolvedTrack, layoutDelegate, eventBus = defaultEventBus, observationAdapter = null }) {
    this.#id = id;
    this.#mode = mode === "authored-graph" ? "authored-graph" : "standalone";
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
    this.#eventBus = eventBus;
    this.#standaloneObservationAdapter = this.#mode === "standalone" ? (observationAdapter ?? new StandaloneObservationAdapter()) : null;
    this.#standaloneObservationAdapter?.register(this);
  }
  get id() { return this.#id; }
  get mode() { return this.#mode; }
  get currentOffset() { return this.#currentOffset; }
  get parent() { return this.#parent; }
  get duration() { return this.#interpolationTimeline?.duration() ?? 0; }
  get isDestroyed() { return this.#destroyed; }
  progress(progress) { if (progress === undefined) return this.#interpolationTimeline?.progress() ?? 0; if (this.#destroyed) return; this.#interpolationTimeline?.progress(clamp01(progress)); this.#notify(); this.#invalidate("progress"); }
  getSnapshot() { this.#assertAlive(); const { _gsap, ...rest } = this.#proxyState || {}; return { ...rest, progress: this.#interpolationTimeline?.progress() ?? 0 }; }
  composeLocal(raw) { this.#assertAlive(); return composePatch(this.#plugins, raw ?? this.getSnapshot(), this.#resolvedTrack, `track "${this.#id}"`); }
  compose(raw, context) { this.#assertAlive(); return this.#owner()?.compose(this, raw, context) ?? this.composeLocal(raw); }
  getObservationOwner() { return this.#owner(); }
  onLifecycle(callback) { if (typeof callback !== "function") throw new TypeError("Track lifecycle callback must be a function."); this.#lifecycleSubscribers.add(callback); return () => this.#lifecycleSubscribers.delete(callback); }
  onSourceDestroyed(callback) { if (typeof callback !== "function") throw new TypeError("Track destroy callback must be a function."); this.#destroySubscribers.add(callback); return () => this.#destroySubscribers.delete(callback); }
  subscribe(callback) { this.#subscribers.add(callback); callback(this.getSnapshot()); return () => this.#subscribers.delete(callback); }
  _setObservationController(controller) { this.#observationController = controller ?? null; }
  _emitObservationLifecycle(event) { this.#emit(event); }
  _adoptObservationOwner(owner) { if (this.#mode !== "standalone" || !owner || owner === this.#standaloneObservationAdapter) return; this.#standaloneObservationAdapter?.unregister(this); this.#standaloneObservationAdapter = owner; owner.register(this); }
  #owner() { return this.#observationController ?? this.#standaloneObservationAdapter; }
  #notify() { const snapshot = this.getSnapshot(); for (const callback of this.#subscribers) callback(snapshot); }
  #invalidate(reason) { this.#emit({ type: "invalidated", track: this, reason }); }
  #assertAlive() { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); }
  _mount(host) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (this.#host) throw new Error(`Track "${this.#id}" already mounted`); this.#host = host; }
  _unmount() { this.#host = null; }
  get isMounted() { return this.#host !== null; }
  get childCount() { return this.#children.size; }
  getChild(id) { return this.#children.get(id) ?? null; }
  addChild(child, opts = {}) { if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`); if (child.#parent) throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`); if (this.#children.has(child.id)) throw new Error(`Track "${child.id}" already has a child with id "${child.id}".`); child.#parent = this; const stagger = opts.stagger ?? 0; child.#staggerOffset = stagger; child.#currentOffset = this.#layoutDelegate.computeSpawnOffset([...this.#children.values()], { stagger }); this.#children.set(child.id, child); if (this.#host) this.#host._mountChild(child, child.#currentOffset); this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id }); this.#invalidate("children"); }
  removeChild(id) { const child = this.#children.get(id); if (!child) return; const siblings = [...this.#children.values()]; this.#children.delete(id); child.#parent = null; child.#owner()?.removeSourceEdges?.(child); child.#owner()?.clearObserved?.(child); if (this.#host) this.#host._unmountChild(child); for (const target of this.#layoutDelegate.computeReflow(siblings, child, {})) { target.child.#currentOffset = target.offset; if (this.#host) this.#host._reflowChild(target.child, target.offset); } child.#emit({ type: "detached", track: child, parent: this }); this.#eventBus.emit("child:removing", { id: child.id, parentId: this.#id }); }
  _attachGroupHost(groupHost) { if (this.#groupHost) throw new Error(`Track "${this.#id}" is already a group host.`); this.#groupHost = groupHost; }
  play() { this.#groupHost?.timeline.play(); }
  pause() { this.#groupHost?.timeline.pause(); }
  seek(progress) { if (!this.#groupHost) return this.progress(progress); if (progress === undefined) return this.#groupHost.timeline.progress(); this.#groupHost.timeline.progress(clamp01(progress)); }
  reverse() { this.#groupHost?.timeline.reverse(); }
  destroy() { if (this.#destroyed || this.#destroying) return; this.#destroying = true; const observerIds = this.#owner()?.getObserverIds?.(this) ?? []; const destroyEvent = createDestroyEvent(this.#id, observerIds); for (const callback of [...this.#destroySubscribers]) callback(destroyEvent); this.#owner()?.clearObserved?.(this); this.#owner()?.removeSourceEdges?.(this); this.#destroyed = true; this.#standaloneObservationAdapter?.unregister(this); for (const child of this.#children.values()) child.destroy(); this.#children.clear(); this.#parent = null; this.#host = null; this.#subscribers.clear(); this.#emit({ type: "destroyed", track: this, observerIds: [...observerIds] }); this.#destroySubscribers.clear(); this.#lifecycleSubscribers.clear(); if (this.#groupHost) { this.#groupHost.group.destroy(); this.#groupHost.timeline.kill(); this.#groupHost = null; } try { this.#interpolationTimeline?.kill(); } catch (error) { logger.warn(`track "${this.#id}", failed to kill timeline during destroy()`, error); } }
  #emit(event) { if (this.#destroyed && event.type !== "destroyed") return; for (const callback of [...this.#lifecycleSubscribers]) callback(event); }
}
