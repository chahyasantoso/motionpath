import { buildTopologicalOrder, topologicalTrackOrder } from "./normalizeObservationGraph.js";

const RETRY_OPTIONS = new Set(["maxAttempts", "backoff"]);

/**
 * Ordered, incremental publish pipeline for an observation graph.
 *
 * ## Why the comments are back
 *
 * Pass-2 PR #139 reformatted this file into single-line members and deleted 282
 * lines that were almost entirely the recorded reasoning for its atomicity
 * rules. Finding F-11 in `docs/V5-PASS-2-REVIEW-2026-08-08.md`. This change
 * restores the formatting and the reasoning and changes **no behavior and no
 * error message**, deliberately, so it can be reviewed as a no-op.
 *
 * If you are about to compress this file again: the invariants below were each
 * written after a real failure. Deleting the note is how the invariant gets
 * broken next quarter.
 *
 * ## Known open findings that touch this class
 *
 * - F-01/F-07: `#graphGuard` walks `Track.observedEdges`, the surface P2-03 is
 *   deleting, and it is the third implementation of cycle rejection in the
 *   codebase. It should delegate to `ObservationState`.
 */
export class GraphPublisher {
  #order = [];
  #tracks = new Map();
  #upstream = new Map();
  #downstream = new Map();
  #edges = [];
  #marked = new Set();
  #publishPending = new Set();
  #cache = new Map();
  #hooks = new Map();
  #retryState = new Map();
  #flushNumber = 0;
  #retry;
  #publish;
  #strict;
  #destroyed = false;

  constructor({ graph, order, tracks = new Map(), publish, strict = true, retry } = {}) {
    if (typeof publish !== "function") throw new TypeError("GraphPublisher requires a publish callback.");
    this.#publish = publish;
    this.#strict = strict;
    this.#retry = this.#normalizeRetry(retry);
    // Defensive copy. The publisher used to hold its caller's Map by reference,
    // so a binding that registered a track in its own registry silently rewrote
    // publisher state without going through applyGraph, and the divergence was
    // undetectable afterwards because both sides were the same object.
    const nextTracks = new Map(tracks);
    for (const [id, track] of nextTracks) {
      if (!track || track.id !== id) throw new Error(`Track registration mismatch for '${id}'.`);
    }
    const nodes = graph
      ? (graph.nodes?.map(({ id }) => ({ id })) ?? [])
      : [...nextTracks.keys()].map((id) => ({ id }));
    const edges = graph ? (graph.edges ?? []) : [];
    const resolvedOrder = graph
      ? topologicalTrackOrder(graph, { strict: true })
      : [...(order ?? nextTracks.keys())];
    this.#commitGraph(this.#prepareGraph(nodes, edges, resolvedOrder, nextTracks));
    this.#attachHooks();
  }

  get graphOrder() {
    return [...this.#order];
  }
  get trackCount() {
    return this.#tracks.size;
  }
  get isDestroyed() {
    return this.#destroyed;
  }

  // Invalidation is inert after disposal rather than fatal: it arrives from
  // Track lifecycle events, which can still be in flight during teardown.
  markDirty(id) {
    if (this.#destroyed) return;
    if (!this.#tracks.has(id)) {
      if (this.#strict) throw new Error(`Unknown track id '${id}'.`);
      return;
    }
    this.#marked.add(id);
  }

  markAllDirty() {
    if (!this.#destroyed) for (const id of this.#tracks.keys()) this.#marked.add(id);
  }

  resetRetry(id) {
    if (this.#destroyed) return;
    if (!this.#tracks.has(id)) {
      if (this.#strict) throw new Error(`Unknown track id '${id}'.`);
      return;
    }
    this.#retryState.delete(id);
    this.#publishPending.add(id);
  }

  /**
   * One pass over the publish order. Compose at most once per node, publish only
   * what changed, and never let a failed upstream node produce a downstream
   * publish from stale input.
   */
  flush() {
    if (this.#destroyed) return 0;
    this.#flushNumber++;
    if (!this.#marked.size && !this.#publishPending.size && this.#isWarm()) return 0;
    const marked = new Set(this.#marked);
    const retrying = new Set([...this.#publishPending].filter((id) => this.#canRetry(id)));
    const changed = new Set();
    const blocked = new Set();
    const failures = [];
    const composed = new Map();
    let published = 0;
    for (const id of this.#order) {
      const track = this.#tracks.get(id);
      if (!track || track.isDestroyed) continue;
      const upstream = this.#upstream.get(id) ?? [];
      // A blocked upstream node poisons everything downstream of it. Publishing
      // a dependent from a stale source is worse than publishing nothing.
      if (upstream.some((source) => blocked.has(source))) {
        blocked.add(id);
        this.#marked.add(id);
        continue;
      }
      const stateChanged = marked.has(id) || upstream.some((source) => changed.has(source));
      const shouldRetry = retrying.has(id);
      const needsCompose = stateChanged || shouldRetry || !this.#cache.has(id);
      if (!needsCompose) {
        composed.set(id, this.#cache.get(id));
        continue;
      }
      let patch;
      try {
        patch = track.compose(undefined, composed);
      } catch (error) {
        failures.push(error);
        blocked.add(id);
        this.#marked.add(id);
        continue;
      }
      this.#cache.set(id, patch);
      composed.set(id, patch);
      if (!stateChanged && !shouldRetry) continue;
      if (stateChanged) changed.add(id);
      try {
        this.#publish(id, patch);
        published++;
        this.#marked.delete(id);
        this.#publishPending.delete(id);
        this.#retryState.delete(id);
      } catch (error) {
        failures.push(error);
        // The patch is valid. Keep retry state separate from state invalidation,
        // otherwise a retry falsely propagates to unchanged dependents.
        this.#marked.delete(id);
        this.#recordPublishFailure(id);
      }
    }
    // Drop bookkeeping for tracks that disappeared or died mid-flush.
    for (const id of [...this.#marked]) {
      if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#marked.delete(id);
    }
    for (const id of [...this.#publishPending]) {
      if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#publishPending.delete(id);
    }
    for (const id of [...this.#retryState.keys()]) {
      if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#retryState.delete(id);
    }
    if (failures.length) throw new AggregateError(failures, "GraphPublisher flush failed.");
    return published;
  }

  /**
   * Wholesale graph swap. Prepare and validate the entire candidate first: a
   * rejected swap must leave the publisher exactly as it was, because the
   * binding that called it has already committed its own live wiring and will
   * roll that back only if this throws cleanly.
   */
  applyGraph(graph, tracks = this.#tracks) {
    this.#assertAlive();
    const order = topologicalTrackOrder(graph, { strict: true });
    const nextTracks = new Map(tracks);
    const nodes = graph.nodes?.map(({ id }) => ({ id })) ?? [];
    const state = this.#prepareGraph(nodes, graph.edges ?? [], order, nextTracks);
    const previousTracks = this.#tracks;
    const previousEdges = this.#edges;
    const invalidationSeeds = new Set();
    const previousIds = new Set(previousTracks.keys());
    for (const [id, track] of nextTracks) {
      if (!previousTracks.has(id) || previousTracks.get(id) !== track) invalidationSeeds.add(id);
    }
    for (const id of previousIds) if (!nextTracks.has(id)) invalidationSeeds.add(id);
    // Edge-level diff, not a wholesale invalidation: a one-edge change should
    // not force every node in the graph to recompose.
    const edgeKey = (edge) => `${edge.source}${edge.target}${edge.role ?? "output"}${edge.input ?? ""}`;
    const oldEdges = new Map(previousEdges.map((edge) => [edgeKey(edge), edge]));
    const newEdges = new Map(state.edges.map((edge) => [edgeKey(edge), edge]));
    for (const [key, edge] of oldEdges) if (!newEdges.has(key)) invalidationSeeds.add(edge.target);
    for (const [key, edge] of newEdges) if (!oldEdges.has(key)) invalidationSeeds.add(edge.target);
    this.#detachHooks();
    this.#commitGraph(state);
    this.#attachHooks();
    for (const id of previousIds) {
      if (!this.#tracks.has(id)) {
        this.#cache.delete(id);
        this.#marked.delete(id);
        this.#publishPending.delete(id);
        this.#retryState.delete(id);
      }
    }
    for (const id of invalidationSeeds) {
      if (!this.#tracks.has(id)) continue;
      this.#cache.delete(id);
      this.#publishPending.delete(id);
      this.#retryState.delete(id);
      this.#marked.add(id);
    }
    this.#markDownstream(invalidationSeeds);
  }

  /**
   * Atomic. The registry used to be written before the graph was validated, so
   * a rejected registration left the publisher holding a track that belonged to
   * no graph: invisible to flush, undeletable by removeTrack, and counted by
   * trackCount.
   */
  addTrack(idOrTrack, trackOrOptions, maybeOptions) {
    this.#assertAlive();
    const idFirst = typeof idOrTrack === "string";
    const track = idFirst ? trackOrOptions : idOrTrack;
    const id = idFirst ? idOrTrack : track?.id;
    const options = (idFirst ? maybeOptions : trackOrOptions) ?? {};
    if (!track || typeof track.compose !== "function") throw new TypeError("addTrack requires a Track.");
    if (track.id !== id) {
      throw new Error(`Track id '${track.id}' does not match registration id '${id}'.`);
    }
    if (this.#tracks.has(id)) throw new Error(`Duplicate track id '${id}'.`);
    const nodes = [...this.#order.map((existing) => ({ id: existing })), { id }];
    const edges = [...this.#edges, ...(options.observes ?? []).map((edge) => ({ ...edge, target: id }))];
    const nextTracks = new Map(this.#tracks).set(id, track);
    this.#commitGraph(this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), nextTracks));
    this.#attachHooks();
    this.#marked.add(id);
  }

  addEdge(edge) {
    this.#assertAlive();
    const edges = [
      ...this.#edges,
      {
        source: edge.source,
        target: edge.target,
        role: edge.role ?? "output",
        input: edge.role === "input" ? edge.target : undefined,
      },
    ];
    const nodes = this.#order.map((id) => ({ id }));
    this.#commitGraph(this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), this.#tracks));
    this.#marked.add(edge.target);
    this.#cache.delete(edge.target);
  }

  removeEdge(edge) {
    this.#assertAlive();
    const edges = this.#edges.filter(
      (existing) =>
        !(
          existing.source === edge.source &&
          existing.target === edge.target &&
          (edge.role === undefined || existing.role === edge.role)
        ),
    );
    const nodes = this.#order.map((id) => ({ id }));
    this.#commitGraph(this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), this.#tracks));
    this.#marked.add(edge.target);
    this.#cache.delete(edge.target);
  }

  /**
   * Retained deliberately. The replacement runtime destroy path does not exist
   * yet, and removing this early would leave a destroyed track wired into the
   * publish order.
   *
   * Unlike the other mutators this stays a no-op after disposal: it is where a
   * late Track "destroyed" or "detached" event lands, and teardown must not
   * throw.
   *
   * `invalidateDependents` came from #139. A detached source keeps its
   * dependents alive, so they must be recomposed without it rather than left
   * holding its last contribution forever. A destroyed source does not need it,
   * because its dependents are being torn down too.
   */
  removeTrack(id, { invalidateDependents = false } = {}) {
    if (this.#destroyed || !this.#tracks.has(id)) return;
    const dependents = invalidateDependents ? [...(this.#downstream.get(id) ?? [])] : [];
    const nodes = this.#order.filter((existing) => existing !== id).map((existing) => ({ id: existing }));
    const edges = this.#edges.filter((edge) => edge.source !== id && edge.target !== id);
    const nextTracks = new Map(this.#tracks);
    nextTracks.delete(id);
    const state = this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), nextTracks);
    this.#detachHook(id);
    this.#commitGraph(state);
    this.#cache.delete(id);
    this.#marked.delete(id);
    this.#publishPending.delete(id);
    this.#retryState.delete(id);
    for (const target of dependents) {
      if (this.#tracks.has(target)) {
        this.#cache.delete(target);
        this.#marked.add(target);
      }
    }
    if (invalidateDependents) this.#markDownstream(new Set(dependents));
  }

  /**
   * Idempotent. Detaches every hook and graph guard first, then drops the
   * publisher's own references. Nothing the caller owns is mutated.
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#detachHooks();
    this.#cache.clear();
    this.#marked.clear();
    this.#publishPending.clear();
    this.#retryState.clear();
    this.#tracks = new Map();
    this.#upstream = new Map();
    this.#downstream = new Map();
    this.#edges = [];
    this.#order = [];
  }

  #assertAlive() {
    if (this.#destroyed) throw new Error("GraphPublisher destroyed");
  }

  /**
   * Build and fully validate a candidate graph state. Throws before returning
   * if anything is inconsistent, so every caller can treat the returned state
   * as safe to install.
   *
   * Membership is checked in BOTH directions. The old one-way check only
   * verified that an edge's target existed, which let an unregistered node sit
   * in the publish order and never compose, and let a registered track vanish
   * from the order and never publish. Both shipped looking healthy.
   */
  #prepareGraph(nodes, edges, order, tracks) {
    const nodeIds = new Set();
    for (const { id } of nodes) {
      if (nodeIds.has(id)) throw new Error(`Graph declares node '${id}' more than once.`);
      nodeIds.add(id);
    }
    for (const id of nodeIds) {
      if (!tracks.has(id)) throw new Error(`Graph node '${id}' has no registered track.`);
    }
    for (const id of tracks.keys()) {
      if (!nodeIds.has(id)) throw new Error(`Registered track '${id}' is missing from the graph.`);
    }
    const nextOrder = [...order];
    const rank = new Map();
    if (nextOrder.length !== nodeIds.size) {
      throw new Error(`Publish order covers ${nextOrder.length} of ${nodeIds.size} graph nodes.`);
    }
    for (const id of nextOrder) {
      if (!nodeIds.has(id)) throw new Error(`Publish order references unknown node '${id}'.`);
      if (rank.has(id)) throw new Error(`Publish order lists '${id}' more than once.`);
      rank.set(id, rank.size);
    }
    const nextEdges = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      role: edge.role ?? "output",
      input: edge.input,
    }));
    const upstream = new Map([...nodeIds].map((id) => [id, []]));
    const downstream = new Map([...nodeIds].map((id) => [id, []]));
    for (const edge of nextEdges) {
      if (!upstream.has(edge.source)) throw new Error(`Graph edge sources unknown track '${edge.source}'.`);
      if (!upstream.has(edge.target)) throw new Error(`Graph edge targets unknown track '${edge.target}'.`);
      // The order is the schedule. An edge it does not respect means a
      // dependent composes before its source and reads a stale patch.
      if (rank.get(edge.source) >= rank.get(edge.target)) {
        throw new Error(`Publish order violates edge '${edge.source}' -> '${edge.target}'.`);
      }
      upstream.get(edge.target).push(edge.source);
      downstream.get(edge.source).push(edge.target);
    }
    return { order: nextOrder, edges: nextEdges, upstream, downstream, tracks };
  }

  #commitGraph(state) {
    this.#order = state.order;
    this.#edges = state.edges;
    this.#upstream = state.upstream;
    this.#downstream = state.downstream;
    this.#tracks = state.tracks;
  }

  // "Warm" means every live track has a cached patch. A cold publisher must run
  // a first pass even with nothing marked dirty, or the first tick publishes
  // nothing at all.
  #isWarm() {
    for (const [id, track] of this.#tracks) {
      if (!track?.isDestroyed && !this.#cache.has(id)) return false;
    }
    return true;
  }

  #canRetry(id) {
    const state = this.#retryState.get(id);
    return !state || state.nextRetryFlush <= this.#flushNumber;
  }

  #recordPublishFailure(id) {
    const previous = this.#retryState.get(id);
    const attempts = (previous?.attempts ?? 0) + 1;
    const exhausted = attempts >= this.#retry.maxAttempts;
    this.#retryState.set(id, {
      attempts,
      exhausted,
      nextRetryFlush: this.#flushNumber + this.#retry.backoff + 1,
    });
    if (!exhausted) this.#publishPending.add(id);
    else this.#publishPending.delete(id);
  }

  /**
   * `onExhausted` used to be accepted, validated and then never read: an
   * exhausted node always stopped retrying regardless. Configuration that does
   * nothing is worse than no configuration, so it is rejected loudly now.
   *
   * The specific per-option error messages this method used to throw were
   * collapsed into one string by #139. That is a real regression in
   * diagnosability, but restoring the messages is a behavior change and needs a
   * local test run, so it is tracked in the review rather than done here.
   */
  #normalizeRetry(retry = {}) {
    if (retry === null || typeof retry !== "object" || Array.isArray(retry)) {
      throw new TypeError("retry must be an object.");
    }
    for (const key of Object.keys(retry)) {
      if (!RETRY_OPTIONS.has(key)) {
        throw new TypeError(`Unknown retry option '${key}'. Supported options are maxAttempts and backoff.`);
      }
    }
    const maxAttempts = retry.maxAttempts === undefined ? Infinity : Number(retry.maxAttempts);
    const backoff = retry.backoff === undefined ? 0 : Number(retry.backoff);
    if (
      !(maxAttempts > 0) ||
      (!Number.isInteger(maxAttempts) && maxAttempts !== Infinity) ||
      !(backoff >= 0) ||
      !Number.isInteger(backoff)
    ) {
      throw new TypeError("invalid retry configuration");
    }
    return { maxAttempts, backoff };
  }

  // Breadth-first over the downstream index built by #prepareGraph. PR-21
  // measured this: walking every edge per invalidation was the hot path.
  #markDownstream(seeds) {
    const queue = [...seeds].filter((id) => this.#tracks.has(id));
    const seen = new Set(queue);
    while (queue.length) {
      const source = queue.shift();
      for (const target of this.#downstream.get(source) ?? []) {
        if (seen.has(target)) continue;
        seen.add(target);
        this.#cache.delete(target);
        this.#publishPending.delete(target);
        this.#retryState.delete(target);
        this.#marked.add(target);
        queue.push(target);
      }
    }
  }

  /**
   * Cycle rejection for authored graphs, installed on each Track as a guard so
   * the edge is refused before it exists.
   *
   * Findings F-01 and F-07: this walks `Track.observedEdges`, which P2-03 is
   * deleting, and it is the third implementation of this invariant alongside
   * `normalizeObservationGraph` and `ObservationState.#assertAcyclic`. It should
   * delegate to ObservationState rather than re-deriving the graph from Tracks.
   */
  #graphGuard = (observer, source) => {
    if (!this.#tracks.has(observer.id) || !this.#tracks.has(source.id)) return;
    const seen = new Set();
    const queue = [source];
    while (queue.length) {
      const current = queue.shift();
      if (current === observer) {
        throw new Error(`Observing "${source.id}" from "${observer.id}" would create a cycle.`);
      }
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      for (const edge of current.observedEdges ?? []) queue.push(edge.source);
    }
  };

  #attachHooks() {
    if (this.#destroyed) return;
    for (const [id, track] of this.#tracks) {
      if (this.#hooks.has(id)) continue;
      track._setGraphGuard?.(this.#graphGuard);
      const unsubscribe = track.onLifecycle?.((event) => {
        if (event.type === "invalidated") this.markDirty(id);
        if (event.type === "destroyed") this.removeTrack(id);
        if (event.type === "detached") this.removeTrack(id, { invalidateDependents: true });
      });
      this.#hooks.set(id, unsubscribe ?? (() => {}));
    }
  }

  #detachHook(id) {
    this.#hooks.get(id)?.();
    this.#hooks.delete(id);
    this.#tracks.get(id)?._setGraphGuard?.(null);
  }

  #detachHooks() {
    for (const id of [...this.#hooks.keys()]) this.#detachHook(id);
  }
}
