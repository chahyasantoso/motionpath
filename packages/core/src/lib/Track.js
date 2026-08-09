import { composePatch } from "../usecases/ComposeTrackPatch.js";
import { COMPOSING } from "../usecases/composeContext.js";
import { mergePatches } from "../usecases/mergePatches.js";
import { observationEdgeKey } from "../usecases/observationEdge.js";
import { StandaloneObservationAdapter } from "../usecases/StandaloneObservationAdapter.js";
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
import { eventBus as defaultEventBus } from "./eventBus.js";
import { logger } from "./logger.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * A Track is a playhead plus local plugin composition.
 *
 * ## Observation ownership, mid-extraction (P2-03)
 *
 * This class is being reduced to a leaf. Two things are true at once right now
 * and both are temporary:
 *
 * 1. Standalone Tracks route edge mutation through `StandaloneObservationAdapter`
 *    AND keep a local copy in `#observed`/`#observers`. The adapter answers
 *    `observedSources`/`observedEdges`; the local reverse registry still answers
 *    `observerCount`/`observerIds`. That split is finding F-03 in
 *    `docs/V5-PASS-2-REVIEW-2026-08-08.md` and it is the next thing to close.
 * 2. `observedEdges` has consumers outside this class (ObservationStateBridge,
 *    GraphBinding rollback snapshots, GraphPublisher's cycle guard). They must
 *    read `ObservationState` before this surface can be deleted. See
 *    `docs/V5-P2-03-SYMBOL-BAN.md`.
 *
 * Do not add a third observation writer here. Do not delete the comments that
 * explain why an ordering exists.
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
  #observed = new Map();
  #observers = new Map();
  #graphGuard = null;
  #observationComposer = null;
  #standaloneObservationAdapter;
  #groupHost = null;
  #destroyed = false;
  #destroying = false;

  constructor({
    id,
    mode = "standalone",
    interpolationTimeline,
    proxyState,
    plugins,
    resolvedTrack,
    layoutDelegate,
    eventBus = defaultEventBus,
    observationAdapter = null,
  }) {
    this.#id = id;
    this.#mode = mode === "authored-graph" ? "authored-graph" : "standalone";
    this.#interpolationTimeline = interpolationTimeline;
    this.#proxyState = proxyState;
    this.#plugins = plugins;
    this.#resolvedTrack = resolvedTrack;
    this.#layoutDelegate = layoutDelegate ?? defaultGaplessLayoutDelegate;
    this.#eventBus = eventBus;
    // Authored graphs are wired by GraphBinding and must not own a standalone
    // adapter. Standalone Tracks fall back to their own adapter so that direct
    // `new Track()` callers still work; see F-02 in the pass-2 review for why
    // that fallback should become an injected per-Motion adapter instead.
    this.#standaloneObservationAdapter =
      this.#mode === "standalone" ? (observationAdapter ?? new StandaloneObservationAdapter()) : null;
    this.#standaloneObservationAdapter?.register(this);
  }

  get id() {
    return this.#id;
  }
  get mode() {
    return this.#mode;
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
  get isDestroyed() {
    return this.#destroyed;
  }

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

  composeLocal(raw) {
    this.#assertAlive();
    return composePatch(this.#plugins, raw ?? this.getSnapshot(), this.#resolvedTrack, `track "${this.#id}"`);
  }

  /**
   * Composition has three owners in priority order: an injected composer
   * (GraphBinding, authored graphs), the standalone adapter, then the legacy
   * local walk. The local walk is the one P2-03 deletes; it stays until the
   * adapter path is the only standalone path.
   */
  compose(raw, ctx) {
    this.#assertAlive();
    if (this.#observationComposer) return this.#observationComposer(raw, ctx);
    if (this.#standaloneObservationAdapter) return this.#standaloneObservationAdapter.compose(this, raw, ctx);
    ctx ??= new Map();
    const cached = ctx.get(this.#id);
    // COMPOSING means a cycle reached this node mid-walk. Standalone mutual
    // observation is legal, so the answer is the local patch rather than an
    // error: the back-edge contributes once, not forever.
    if (cached === COMPOSING) return this.composeLocal(raw);
    if (cached !== undefined) return cached;
    ctx.set(this.#id, COMPOSING);
    let source = raw ?? this.getSnapshot();
    for (const { source: observed, mapFn, role } of this.#observed.values()) {
      if (role !== "input" || !mapFn) continue;
      const contribution = mapFn(observed.compose(undefined, ctx));
      if (contribution) source = { ...source, ...contribution };
    }
    let patch = this.composeLocal(source);
    for (const { source: observed, mapFn, role } of this.#observed.values()) {
      if (role !== "output" || !mapFn) continue;
      // mergePatches, not a spread. An identical edge set composed with a
      // shallow spread produced different nested values, which is exactly the
      // divergence assertCompositionParity() exists to catch.
      const contribution = mapFn(observed.compose(undefined, ctx));
      if (contribution) patch = mergePatches(patch, contribution);
    }
    ctx.set(this.#id, patch);
    return patch;
  }

  setObserved(track, mapFn, opts = {}) {
    if (!track) {
      if (this.#standaloneObservationAdapter) this.#standaloneObservationAdapter.clearObserved(this);
      else this.#clearObserved();
      this.#invalidate("observation");
      return;
    }
    if (track === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    if (track.isDestroyed) throw new Error(`Track "${track.id}" is destroyed.`);
    const role = opts.role ?? "output";
    const input = role === "input" ? opts.target : undefined;
    // The guard runs before any mutation, in both modes. An authored graph must
    // reject a cycle before the edge exists, not roll one back afterwards.
    this.#graphGuard?.(this, track, { role, input });
    const key = observationEdgeKey(track.id, role, input);
    const previous = this.#observed.get(key);
    if (this.#standaloneObservationAdapter) this.#standaloneObservationAdapter.setObserved(this, track, mapFn, opts);
    // Compatibility bookkeeping, F-03. Identical in both modes today.
    if (previous) previous.source._removeObserver(this, key);
    this.#observed.set(key, { source: track, mapFn: mapFn ?? null, role, input });
    track._addObserver(this, key);
    this.#emitLifecycle({
      type: previous ? "edge-replaced" : "edge-added",
      track: this,
      source: track,
      edge: { source: track.id, target: this.#id, role, input },
    });
    this.#invalidate("observation");
  }

  removeObserved(track, opts = {}) {
    if (!track) return;
    if (this.#standaloneObservationAdapter) this.#standaloneObservationAdapter.removeObserved(this, track, opts);
    const keys = [...this.#observed.entries()]
      .filter(
        ([, edge]) =>
          edge.source === track &&
          (opts.role === undefined || edge.role === opts.role) &&
          (opts.role !== "input" || opts.target === undefined || edge.input === opts.target),
      )
      .map(([key]) => key);
    for (const key of keys) this.#removeObservedKey(key);
    if (keys.length) this.#invalidate("observation");
  }

  /**
   * Known divergence, finding F-06: the adapter branch rewrites `#observed`
   * directly and emits one removed/added pair per edge, while the legacy branch
   * re-runs removal and `setObserved`, which emits its own events on top. The
   * two modes therefore produce different lifecycle sequences for the same
   * logical operation. Behavior is preserved here deliberately so this slice
   * stays a formatting-and-safety change; collapsing the paths is its own slice.
   */
  replaceObserved(oldSource, newSource, mapFn, opts = {}) {
    if (!oldSource || !newSource) throw new TypeError("replaceObserved requires two source tracks.");
    if (newSource === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    if (oldSource === newSource) throw new Error("replaceObserved requires two different source tracks.");
    const replaced = [...this.#observed.entries()].filter(
      ([, edge]) => edge.source === oldSource && (opts.role === undefined || edge.role === opts.role),
    );
    if (!replaced.length) throw new Error(`Track "${this.#id}" does not observe "${oldSource.id}".`);
    for (const [, edge] of replaced) this.#graphGuard?.(this, newSource, { role: edge.role, input: edge.input });
    if (this.#standaloneObservationAdapter) {
      this.#standaloneObservationAdapter.replaceObserved(this, oldSource, newSource, mapFn, opts);
    }
    for (const [oldKey, edge] of replaced) {
      const role = edge.role;
      const input = role === "input" ? (opts.target ?? edge.input) : undefined;
      const key = observationEdgeKey(newSource.id, role, input);
      this.#observed.delete(oldKey);
      this.#observed.set(key, { source: newSource, mapFn: mapFn ?? edge.mapFn, role, input });
      oldSource._removeObserver(this, oldKey);
      newSource._addObserver(this, key);
      this.#emitLifecycle({
        type: "edge-removed",
        track: this,
        source: oldSource,
        edge: { source: oldSource.id, target: this.#id, role: edge.role, input: edge.input },
      });
      this.#emitLifecycle({
        type: "edge-added",
        track: this,
        source: newSource,
        edge: { source: newSource.id, target: this.#id, role, input },
      });
    }
    if (!this.#standaloneObservationAdapter) {
      for (const [oldKey] of replaced) this.#removeObservedKey(oldKey);
      for (const [, edge] of replaced) {
        this.setObserved(newSource, mapFn ?? edge.mapFn, { role: edge.role, target: edge.input });
      }
    }
    this.#invalidate("observation");
  }

  get observedSources() {
    if (!this.#standaloneObservationAdapter) {
      return [...new Set([...this.#observed.values()].map((edge) => edge.source))];
    }
    return this.#standaloneObservationAdapter.state
      .getSources(this.#id)
      .map((id) => this.#standaloneObservationAdapter.tracks.get(id))
      .filter(Boolean);
  }

  get observedEdges() {
    const source = this.#standaloneObservationAdapter
      ? this.#standaloneObservationAdapter.state.getEdges(this.#id)
      : [...this.#observed.values()];
    return source.map(({ source: observed, mapFn, role, input }) => ({
      source: observed,
      mapFn,
      role,
      input,
      target: this.#id,
    }));
  }

  // F-03: these two still read the local reverse registry while the getters
  // above read the adapter. Point them at `state.getObserverIds()` and prove
  // equivalence BEFORE deleting #observers, or teardown starts reporting an
  // empty observer set to every dependent.
  get observerCount() {
    return this.#observers.size;
  }
  get observerIds() {
    return [...this.#observers.keys()].map((observer) => observer.id);
  }

  onLifecycle(callback) {
    if (typeof callback !== "function") throw new TypeError("Track lifecycle callback must be a function.");
    this.#lifecycleSubscribers.add(callback);
    return () => this.#lifecycleSubscribers.delete(callback);
  }

  onSourceDestroyed(callback) {
    if (typeof callback !== "function") throw new TypeError("Track destroy callback must be a function.");
    this.#destroySubscribers.add(callback);
    return () => this.#destroySubscribers.delete(callback);
  }

  subscribe(callback) {
    this.#subscribers.add(callback);
    callback(this.getSnapshot());
    return () => this.#subscribers.delete(callback);
  }

  _setGraphGuard(guard) {
    this.#graphGuard = guard ?? null;
  }
  _setObservationComposer(composer) {
    this.#observationComposer = typeof composer === "function" ? composer : null;
  }
  _addObserver(observer, key) {
    const keys = this.#observers.get(observer) ?? new Set();
    keys.add(key);
    this.#observers.set(observer, keys);
  }
  _removeObserver(observer, key) {
    const keys = this.#observers.get(observer);
    if (!keys) return;
    keys.delete(key);
    if (!keys.size) this.#observers.delete(observer);
  }

  #notify() {
    const snapshot = this.getSnapshot();
    for (const callback of this.#subscribers) callback(snapshot);
  }

  // "destroyed" is the one event allowed to fire after teardown starts, because
  // it IS the teardown notification. Everything else is suppressed so a
  // half-torn-down Track cannot invalidate a publisher.
  #emitLifecycle(event) {
    if (this.#destroyed && event.type !== "destroyed") return;
    for (const callback of [...this.#lifecycleSubscribers]) callback(event);
  }

  #invalidate(reason) {
    this.#emitLifecycle({ type: "invalidated", track: this, reason });
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`);
  }

  #removeObservedKey(key) {
    const edge = this.#observed.get(key);
    if (!edge) return;
    this.#observed.delete(key);
    if (this.#standaloneObservationAdapter) {
      this.#standaloneObservationAdapter.removeObserved(this, edge.source, { role: edge.role, target: edge.input });
    }
    edge.source._removeObserver(this, key);
    this.#emitLifecycle({
      type: "edge-removed",
      track: this,
      source: edge.source,
      edge: { source: edge.source.id, target: this.#id, role: edge.role, input: edge.input },
    });
  }

  #clearObserved() {
    for (const key of [...this.#observed.keys()]) this.#removeObservedKey(key);
  }

  #detachObservationEdges() {
    for (const [observer, keys] of [...this.#observers]) {
      for (const key of keys) observer.#removeObservedKey(key);
    }
    this.#observers.clear();
    this.#clearObserved();
  }

  _mount(host) {
    if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`);
    if (this.#host) throw new Error(`Track "${this.#id}" already mounted`);
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

  // P2-04 removes addChild/removeChild/_attachGroupHost and the playback bridge
  // below. Motion already exposes mountChild/unmountChild/reflowChild; this
  // class should call those named APIs rather than the underscored aliases as
  // the first step (finding F-17).
  addChild(child, opts = {}) {
    if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`);
    if (child.#parent) throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`);
    if (this.#children.has(child.id)) {
      throw new Error(`Track "${this.#id}" already has a child with id "${child.id}".`);
    }
    child.#parent = this;
    const stagger = opts.stagger ?? 0;
    child.#staggerOffset = stagger;
    child.#currentOffset = this.#layoutDelegate.computeSpawnOffset([...this.#children.values()], { stagger });
    this.#children.set(child.id, child);
    if (this.#host) this.#host._mountChild(child, child.#currentOffset);
    this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id });
    this.#invalidate("children");
  }

  removeChild(id) {
    const child = this.#children.get(id);
    if (!child) return;
    const siblings = [...this.#children.values()];
    this.#children.delete(id);
    child.#parent = null;
    // Detach edges before unmounting. A detached child that still holds
    // observation edges is a dependency the publisher cannot see or clean up.
    child.#detachObservationEdges();
    if (this.#host) this.#host._unmountChild(child);
    for (const target of this.#layoutDelegate.computeReflow(siblings, child, {})) {
      target.child.#currentOffset = target.offset;
      if (this.#host) this.#host._reflowChild(target.child, target.offset);
    }
    child.#emitLifecycle({ type: "detached", track: child, parent: this });
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

  /**
   * Teardown, and the ordering matters.
   *
   * Destroy subscribers are notified while this Track still reports itself as
   * alive, so a listener can read `observerIds` and the adapter can report the
   * dependents that are about to lose their source. GraphBinding reacts to that
   * notification with `removeTrack(id)`, whose default is `{ destroy: true }`
   * and which checks `isDestroyed` first, so before the `#destroying` guard
   * existed this method re-entered itself: the nested call ran the entire body,
   * then the outer call emitted "destroyed" a second time and killed the
   * interpolation timeline twice. It survived on luck, namely an already-cleared
   * subscriber set. Finding F-04.
   *
   * The guard closes the window without moving the notification back after
   * teardown, which would defeat the point of notifying at all.
   */
  destroy() {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    const observerIds = this.observerIds;
    for (const callback of [...this.#destroySubscribers]) callback({ id: this.#id, observerIds });
    this.#detachObservationEdges();
    this.#destroyed = true;
    this.#observationComposer = null;
    this.#standaloneObservationAdapter?.unregister(this.#id);
    for (const child of this.#children.values()) child.destroy();
    this.#children.clear();
    this.#parent = null;
    this.#host = null;
    this.#subscribers.clear();
    this.#graphGuard = null;
    this.#emitLifecycle({ type: "destroyed", track: this, observerIds });
    this.#destroySubscribers.clear();
    this.#lifecycleSubscribers.clear();
    if (this.#groupHost) {
      this.#groupHost.group.destroy();
      this.#groupHost.timeline.kill();
      this.#groupHost = null;
    }
    try {
      this.#interpolationTimeline?.kill();
    } catch (error) {
      logger.warn(`track "${this.#id}", failed to kill interpolation timeline during destroy()`, error);
    }
  }
}
