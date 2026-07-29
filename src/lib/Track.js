import { composePatch } from "../usecases/ComposeTrackPatch.js";
import { mergePatches } from "../usecases/mergePatches.js";
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
import { eventBus as defaultEventBus } from "./eventBus.js";
import { logger } from "./logger.js";

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}
const COMPOSING = Symbol("composing");

export class Track {
  #id;
  #interpolationTimeline;
  #proxyState;
  #plugins;
  #resolvedTrack;
  #eventBus;
  #host = null;
  #parent = null;
  #children = new Map();
  #subscribers = new Set();
  #currentOffset = 0;
  #staggerOffset = 0;
  #layoutDelegate;
  #observed = new Map();
  #groupHost = null;
  constructor({
    id,
    interpolationTimeline,
    proxyState,
    plugins,
    resolvedTrack,
    layoutDelegate,
    eventBus = defaultEventBus,
  }) {
    this.#id = id;
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
    this.#eventBus = eventBus;
  }
  get id() {
    return this.#id;
  }
  get currentOffset() {
    return this.#currentOffset;
  }
  get parent() {
    return this.#parent;
  }
  get duration() {
    return this.#interpolationTimeline?.duration() ?? 0;
  }
  progress(p) {
    if (p === undefined) return this.#interpolationTimeline.progress();
    this.#interpolationTimeline.progress(clamp01(p));
    this.#notify();
  }
  getSnapshot() {
    const { _gsap, ...rest } = this.#proxyState;
    return { ...rest, progress: this.#interpolationTimeline.progress() };
  }
  compose(rawData, ctx) {
    ctx = ctx ?? new Map();
    const cached = ctx.get(this);
    if (cached === COMPOSING)
      return composePatch(
        this.#plugins,
        rawData ?? this.getSnapshot(),
        this.#resolvedTrack,
        `track "${this.#id}"`,
      );
    if (cached !== undefined) return cached;
    ctx.set(this, COMPOSING);
    let source = rawData ?? this.getSnapshot();
    for (const [observedSource, { mapFn, role }] of this.#observed)
      if (role === "input" && mapFn) {
        const contribution = mapFn(observedSource.compose(undefined, ctx));
        if (contribution) source = { ...source, ...contribution };
      }
    let patch = composePatch(
      this.#plugins,
      source,
      this.#resolvedTrack,
      `track "${this.#id}"`,
    );
    for (const [observedSource, { mapFn, role }] of this.#observed)
      if (role === "output" && mapFn) {
        const observedPatch = mapFn(observedSource.compose(undefined, ctx));
        if (observedPatch) patch = mergePatches(patch, observedPatch);
      }
    ctx.set(this, patch);
    return patch;
  }
  setObserved(track, mapFn, opts = {}) {
    if (!track) {
      this.#observed.clear();
      return;
    }
    this.#observed.set(track, {
      mapFn: mapFn ?? null,
      role: opts.role ?? "output",
    });
  }
  removeObserved(track) {
    this.#observed.delete(track);
  }
  get observedSources() {
    return Array.from(this.#observed.keys());
  }
  subscribe(callback) {
    this.#subscribers.add(callback);
    callback(this.getSnapshot());
    return () => this.#subscribers.delete(callback);
  }
  #notify() {
    const snapshot = this.getSnapshot();
    for (const callback of this.#subscribers) callback(snapshot);
  }
  _mount(host) {
    if (this.#host)
      throw new Error(
        `Track "${this.#id}" already mounted to "${this.#host.id ?? "another motion"}"`,
      );
    this.#host = host;
  }
  _unmount() {
    this.#host = null;
  }
  get isMounted() {
    return this.#host !== null;
  }
  get childCount() {
    return this.#children.size;
  }
  getChild(id) {
    return this.#children.get(id) ?? null;
  }
  addChild(child, opts = {}) {
    if (child.#parent)
      throw new Error(
        `Track "${child.id}" is already a child of "${child.#parent.id}"`,
      );
    if (this.#children.has(child.id))
      throw new Error(
        `Track "${this.#id}" already has a child with id "${child.id}".`,
      );
    child.#parent = this;
    const stagger = opts.stagger ?? 0;
    child.#staggerOffset = stagger;
    const spawnOffset = this.#layoutDelegate.computeSpawnOffset(
      Array.from(this.#children.values()),
      { stagger },
    );
    child.#currentOffset = spawnOffset;
    this.#children.set(child.id, child);
    if (this.#host) this.#host._mountChild(child, spawnOffset);
    this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id });
  }
  removeChild(id) {
    const child = this.#children.get(id);
    if (!child) return;
    const siblings = Array.from(this.#children.values());
    this.#children.delete(id);
    child.#parent = null;
    if (this.#host) this.#host._unmountChild(child);
    for (const target of this.#layoutDelegate.computeReflow(
      siblings,
      child,
      {},
    )) {
      target.child.#currentOffset = target.offset;
      if (this.#host) this.#host._reflowChild(target.child, target.offset);
    }
    this.#eventBus.emit("child:removing", { id: child.id, parentId: this.#id });
  }
  _attachGroupHost(groupHost) {
    if (this.#groupHost) throw new Error(`Track "${this.#id}" is already a group host.`);
    this.#groupHost = groupHost;
  }
  play() {
    this.#groupHost?.timeline.play();
  }
  pause() {
    this.#groupHost?.timeline.pause();
  }
  seek(progress) {
    if (!this.#groupHost) return this.progress(progress);
    if (progress === undefined) return this.#groupHost.timeline.progress();
    this.#groupHost.timeline.progress(clamp01(progress));
  }
  reverse() {
    this.#groupHost?.timeline.reverse();
  }
  destroy() {
    this.#subscribers.clear();
    this.#observed.clear();
    if (this.#groupHost) {
      this.#groupHost.group.destroy();
      this.#groupHost.timeline.kill();
      this.#groupHost = null;
    }
    try {
      this.#interpolationTimeline?.kill();
    } catch (e) {
      logger.warn(
        `track "${this.#id}"`,
        "failed to kill the interpolation timeline during destroy()",
        e,
      );
    }
  }
}
