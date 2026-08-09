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
 * ## Why the comments are back
 *
 * PR #139 reformatted this file into single-line members and deleted the notes
 * that recorded its ordering invariants, on a green board, because CI's format
 * job checks two files and there is no linter. Finding F-11 in
 * `docs/V5-PASS-2-REVIEW-2026-08-08.md`. The readability floor in
 * `scripts/v5-readability-allowlist.mjs` now guards this file. If you are about
 * to compress it again: each note below was written after a real failure.
 *
 * ## Observation ownership is mid-extraction, and this file is the seam
 *
 * Three things can own an edge, and they are checked in this order by compose():
 *
 * 1. `#observationComposer`, installed by GraphBinding. Authored graphs route
 *    composition into ObservationState and this file is only a leaf.
 * 2. `#standaloneObservationAdapter`, for direct Track-to-Track use.
 * 3. `#observed`, the legacy local registry, for a Track with neither.
 *
 * While the adapter is present, writes go to BOTH it and `#observed`, and the
 * readers are split: `observedSources`/`observedEdges` read the adapter,
 * `observerCount`/`observerIds` read the adapter when it exists and `#observers`
 * otherwise. That is finding F-03, two writers and split readers over one fact.
 * The migration order that keeps it safe is: point the readers at the adapter,
 * prove equivalence, then delete the local copies. Removing the mutators first
 * silently returns empty observer sets during teardown.
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
  // The legacy pair. `#observed` is the outgoing edge registry keyed by
  // observationEdgeKey; `#observers` is the reverse index, Track -> Set<key>,
  // and it is what makes O(1) teardown of an observed source possible.
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
    // Adapter scope rule. An authored-graph Track NEVER gets an adapter: its
    // edges belong to GraphBinding, and handing it one made GraphBinding see zero
    // live edges against a fully declared graph. A standalone Track uses the
    // adapter it was given, and only falls back to its own when none was passed.
    // Related Tracks must share one adapter or a valid cross-track edge looks
    // unknown, which is why callers should inject rather than rely on the
    // fallback. Finding F-02.
    this.#standaloneObservationAdapter = this.#mode === "standalone"
      ? (observationAdapter ?? new StandaloneObservationAdapter())
      : null;
    this.#standaloneObservationAdapter?.register(this);
  }

  get id() { return this.#id; }
  get mode() { return this.#mode; }
  get currentOffset() { return this.#currentOffset; }
  get parent() { return this.#parent; }
  get duration() { return this.#interpolationTimeline?.duration() ?? 0; }
  get isDestroyed() { return this.#destroyed; }

  progress(progress) {
    if (progress === undefined) {
      return this.#interpolationTimeline?.progress() ?? 0;
    }
    // A destroyed Track absorbs progress instead of throwing: this arrives from
    // tickers and timelines that can still be draining during teardown.
    if (this.#destroyed) return;
    this.#interpolationTimeline?.progress(clamp01(progress));
    this.#notify();
    this.#invalidate("progress");
  }

  getSnapshot() {
    this.#assertAlive();
    // `_gsap` is engine bookkeeping that GSAP writes onto the proxy. It must
    // never reach a plugin or a subscriber as if it were authored state.
    const { _gsap, ...rest } = this.#proxyState || {};
    return {
      ...rest,
      progress: this.#interpolationTimeline?.progress() ?? 0,
    };
  }

  composeLocal(raw) {
    this.#assertAlive();
    return composePatch(
      this.#plugins,
      raw ?? this.getSnapshot(),
      this.#resolvedTrack,
      `track "${this.#id}"`,
    );
  }

  /**
   * Composition uses GraphBinding, the standalone adapter, then legacy state.
   *
   * The order is the ownership order, not a preference. Whoever owns the edges
   * owns the composition, so a graph-bound Track must not also merge its local
   * copy or every contribution lands twice.
   */
  compose(raw, ctx) {
    this.#assertAlive();
    if (this.#observationComposer) {
      return this.#observationComposer(raw, ctx);
    }
    if (this.#standaloneObservationAdapter) {
      return this.#standaloneObservationAdapter.compose(this, raw, ctx);
    }
    ctx ??= new Map();
    const cached = ctx.get(this.#id);
    // COMPOSING marks a node that is already on the stack. Re-entering it means a
    // mutual pair, and the cycle is broken by falling back to the local patch
    // rather than recursing. A finished node is served from the context so a
    // diamond composes its shared ancestor once per pass, not once per path.
    if (cached === COMPOSING) return this.composeLocal(raw);
    if (cached !== undefined) return cached;
    ctx.set(this.#id, COMPOSING);

    // Input edges rewrite the raw state BEFORE the local plugins run, so they can
    // drive a keyframed property. Output edges merge into the composed patch
    // AFTER, so they can override one. Same edge set, two passes, different
    // meaning, and swapping them silently changes authored results.
    let source = raw ?? this.getSnapshot();
    for (const { source: observed, mapFn, role } of this.#observed.values()) {
      if (role !== "input" || !mapFn) continue;
      const contribution = mapFn(observed.compose(undefined, ctx));
      if (contribution) source = { ...source, ...contribution };
    }

    let patch = this.composeLocal(source);
    for (const { source: observed, mapFn, role } of this.#observed.values()) {
      if (role !== "output" || !mapFn) continue;
      const contribution = mapFn(observed.compose(undefined, ctx));
      if (contribution) patch = mergePatches(patch, contribution);
    }
    ctx.set(this.#id, patch);
    return patch;
  }

  setObserved(track, mapFn, opts = {}) {
    // setObserved(null) is "observe nothing", the documented way to clear.
    if (!track) {
      this.#standaloneObservationAdapter?.clearObserved(this);
      this.#clearObserved();
      this.#invalidate("observation");
      return;
    }
    if (track === this) throw new Error(`Track "${this.#id}" cannot observe itself.`);
    if (track.isDestroyed) throw new Error(`Track "${track.id}" is destroyed.`);
    const role = opts.role ?? "output";
    const input = role === "input" ? opts.target : undefined;
    // The guard runs before anything is written. A rejected edge must not exist,
    // not even briefly, or the cycle is observable from a lifecycle subscriber.
    this.#graphGuard?.(this, track, { role, input });
    const key = observationEdgeKey(track.id, role, input);
    const previous = this.#observed.get(key);
    this.#standaloneObservationAdapter?.setObserved(this, track, mapFn, opts);
    // Same key means a mapFn swap, so the old source's reverse entry has to go
    // before the new one lands, otherwise it keeps a dangling observer forever.
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
    this.#standaloneObservationAdapter?.removeObserved(this, track, opts);
    // An omitted role or target means "any", so one call can match several edges.
    // Keys are collected before the loop because #removeObservedKey mutates the
    // map being read.
    const keys = [...this.#observed.entries()]
      .filter(([, edge]) => edge.source === track
        && (opts.role === undefined || edge.role === opts.role)
        && (opts.role !== "input" || opts.target === undefined || edge.input === opts.target))
      .map(([key]) => key);
    for (const key of keys) this.#removeObservedKey(key);
    if (keys.length) this.#invalidate("observation");
  }

  /**
   * Rewire an existing edge onto a new source, keeping role and input.
   *
   * Finding F-06: the two branches below still emit different event sequences for
   * the same logical operation. The adapter branch emits one explicit
   * edge-removed plus edge-added pair per edge; the legacy branch re-runs
   * setObserved, which emits its own on top. Any event-count assertion is
   * therefore mode-dependent until they are collapsed.
   */
  replaceObserved(oldSource, newSource, mapFn, opts = {}) {
    if (!oldSource || !newSource) {
      throw new TypeError("replaceObserved requires two source tracks.");
    }
    if (newSource === this) {
      throw new Error(`Track "${this.#id}" cannot observe itself.`);
    }
    if (oldSource === newSource) {
      throw new Error("replaceObserved requires two different source tracks.");
    }
    const replaced = [...this.#observed.entries()]
      .filter(([, edge]) => edge.source === oldSource
        && (opts.role === undefined || edge.role === opts.role));
    if (!replaced.length) {
      throw new Error(`Track "${this.#id}" does not observe "${oldSource.id}".`);
    }
    // Guard every candidate edge first. A partial rewire is worse than a refusal.
    for (const [, edge] of replaced) {
      this.#graphGuard?.(this, newSource, { role: edge.role, input: edge.input });
    }
    this.#standaloneObservationAdapter?.replaceObserved(
      this,
      oldSource,
      newSource,
      mapFn,
      opts,
    );
    for (const [oldKey, edge] of replaced) {
      const role = edge.role;
      const input = role === "input" ? (opts.target ?? edge.input) : undefined;
      const key = observationEdgeKey(newSource.id, role, input);
      this.#observed.delete(oldKey);
      // An omitted mapFn inherits the one being replaced. Defaulting it to null
      // here would silently turn a live edge into a no-op edge.
      this.#observed.set(key, {
        source: newSource,
        mapFn: mapFn ?? edge.mapFn,
        role,
        input,
      });
      oldSource._removeObserver(this, oldKey);
      newSource._addObserver(this, key);
      this.#emitLifecycle({
        type: "edge-removed",
        track: this,
        source: oldSource,
        edge: {
          source: oldSource.id,
          target: this.#id,
          role: edge.role,
          input: edge.input,
        },
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
        this.setObserved(newSource, mapFn ?? edge.mapFn, {
          role: edge.role,
          target: edge.input,
        });
      }
    }
    this.#invalidate("observation");
  }

  get observedSources() {
    if (this.#standaloneObservationAdapter) {
      return this.#standaloneObservationAdapter.getSources(this);
    }
    return [...new Set([...this.#observed.values()].map((edge) => edge.source))];
  }

  // Reads the adapter when there is one, the local registry otherwise, and
  // always reports `target` so a caller holding a bare edge knows which side it
  // came from. Five call sites in the graph layer still depend on this; F-01
  // lists them and they move to ObservationState before it can be deleted.
  get observedEdges() {
    const source = this.#standaloneObservationAdapter
      ? this.#standaloneObservationAdapter.getEdges(this)
      : [...this.#observed.values()];
    return source.map(({ source: observed, mapFn, role, input }) => ({
      source: observed,
      mapFn,
      role,
      input,
      target: this.#id,
    }));
  }

  get observerCount() {
    if (this.#standaloneObservationAdapter) {
      return this.#standaloneObservationAdapter.getObserverIds(this).length;
    }
    return this.#observers.size;
  }

  get observerIds() {
    if (this.#standaloneObservationAdapter) {
      return this.#standaloneObservationAdapter.getObserverIds(this);
    }
    return [...this.#observers.keys()].map((observer) => observer.id);
  }

  onLifecycle(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Track lifecycle callback must be a function.");
    }
    this.#lifecycleSubscribers.add(callback);
    return () => this.#lifecycleSubscribers.delete(callback);
  }

  onSourceDestroyed(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Track destroy callback must be a function.");
    }
    this.#destroySubscribers.add(callback);
    return () => this.#destroySubscribers.delete(callback);
  }

  subscribe(callback) {
    this.#subscribers.add(callback);
    // Deliver immediately. A subscriber that has to wait for the next tick to
    // learn the current state renders one frame of nothing.
    callback(this.getSnapshot());
    return () => this.#subscribers.delete(callback);
  }

  _setGraphGuard(guard) { this.#graphGuard = guard ?? null; }
  _setObservationComposer(composer) {
    this.#observationComposer = typeof composer === "function" ? composer : null;
  }
  // The reverse index stores a Set of keys per observer, not a count: the same
  // pair can be joined by several edges with different roles or inputs, and a
  // counter cannot tell which one is being removed.
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
  // "destroyed" is the one event allowed out after teardown, because it IS the
  // teardown notice. Everything else is suppressed so a detach cascade cannot
  // emit invalidations for a Track that no longer exists.
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
    this.#standaloneObservationAdapter?.removeObserved(this, edge.source, {
      role: edge.role,
      target: edge.input,
    });
    edge.source._removeObserver(this, key);
    this.#emitLifecycle({
      type: "edge-removed",
      track: this,
      source: edge.source,
      edge: {
        source: edge.source.id,
        target: this.#id,
        role: edge.role,
        input: edge.input,
      },
    });
  }
  #clearObserved() {
    for (const key of [...this.#observed.keys()]) this.#removeObservedKey(key);
  }
  // Both directions. Dropping only the outgoing edges leaves every observer
  // holding this Track as a live source and composing from a dead playhead.
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
  _unmount() { this.#host = null; }
  get isMounted() { return this.#host !== null; }
  get childCount() { return this.#children.size; }
  getChild(id) { return this.#children.get(id) ?? null; }

  addChild(child, opts = {}) {
    if (this.#destroyed) throw new Error(`Track "${this.#id}" is destroyed.`);
    if (child.#parent) {
      throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`);
    }
    if (this.#children.has(child.id)) {
      throw new Error(`Track "${child.id}" already has a child with id "${child.id}".`);
    }
    child.#parent = this;
    const stagger = opts.stagger ?? 0;
    child.#staggerOffset = stagger;
    // The layout delegate owns spawn placement. It reads the existing siblings,
    // so the new child is appended to the map only after the offset is computed.
    child.#currentOffset = this.#layoutDelegate.computeSpawnOffset(
      [...this.#children.values()],
      { stagger },
    );
    this.#children.set(child.id, child);
    if (this.#host) this.#host._mountChild(child, child.#currentOffset);
    this.#eventBus.emit("child:spawned", { id: child.id, parentId: this.#id });
    this.#invalidate("children");
  }

  removeChild(id) {
    const child = this.#children.get(id);
    if (!child) return;
    // Siblings are captured before the delete so the reflow sees the layout the
    // child is leaving, not the one it left.
    const siblings = [...this.#children.values()];
    this.#children.delete(id);
    child.#parent = null;
    child.#detachObservationEdges();
    if (this.#host) this.#host._unmountChild(child);
    for (const target of this.#layoutDelegate.computeReflow(siblings, child, {})) {
      target.child.#currentOffset = target.offset;
      if (this.#host) this.#host._reflowChild(target.child, target.offset);
    }
    // Detached, not destroyed: the child is still a usable standalone Track.
    child.#emitLifecycle({ type: "detached", track: child, parent: this });
    this.#eventBus.emit("child:removing", { id: child.id, parentId: this.#id });
  }

  _attachGroupHost(groupHost) {
    if (this.#groupHost) {
      throw new Error(`Track "${this.#id}" is already a group host.`);
    }
    this.#groupHost = groupHost;
  }
  play() { this.#groupHost?.timeline.play(); }
  pause() { this.#groupHost?.timeline.pause(); }
  // A group host drives its children from the group timeline, so seek has to go
  // there. Without a host, seek is just this Track's own playhead.
  seek(progress) {
    if (!this.#groupHost) return this.progress(progress);
    if (progress === undefined) return this.#groupHost.timeline.progress();
    this.#groupHost.timeline.progress(clamp01(progress));
  }
  reverse() { this.#groupHost?.timeline.reverse(); }

  /**
   * Destroy is re-entrancy guarded because subscribers read observerIds first.
   *
   * Finding F-04. The observer set has to be captured and reported BEFORE the
   * edges are detached, or every subscriber gets an empty list and no one can
   * tell who was affected. But a destroy subscriber is exactly where GraphBinding
   * reacts by calling removeTrack, which calls destroy() again, and the
   * `#destroyed` flag is not set yet at that point. `#destroying` is what makes
   * the nested call a no-op instead of a second full teardown that emits
   * "destroyed" twice and kills the timeline twice.
   *
   * The order below is load-bearing: snapshot, notify, detach, flag, then tear
   * down children and emit.
   */
  destroy() {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    const observerIds = this.observerIds;
    for (const callback of [...this.#destroySubscribers]) {
      callback({ id: this.#id, observerIds });
    }
    this.#detachObservationEdges();
    this.#destroyed = true;
    this.#observationComposer = null;
    this.#standaloneObservationAdapter?.unregister(this);
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
    // Last, and defensive. A third-party timeline that throws on kill must not
    // abort a teardown that has already detached everything else.
    try {
      this.#interpolationTimeline?.kill();
    } catch (error) {
      logger.warn(
        `track "${this.#id}", failed to kill interpolation timeline during destroy()`,
        error,
      );
    }
  }
}
