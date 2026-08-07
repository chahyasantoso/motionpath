import { buildTopologicalOrder, topologicalTrackOrder } from "./normalizeObservationGraph.js";

const RETRY_OPTIONS = new Set(["maxAttempts", "backoff"]);

export class GraphPublisher {
  #order = [];
  #tracks = new Map();
  #upstream = new Map();
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
    for (const [id, track] of nextTracks) if (!track || track.id !== id) throw new Error(`Track registration mismatch for '${id}'.`);
    const nodes = graph ? (graph.nodes?.map(({ id }) => ({ id })) ?? []) : [...nextTracks.keys()].map((id) => ({ id }));
    const edges = graph ? (graph.edges ?? []) : [];
    const resolvedOrder = graph ? topologicalTrackOrder(graph, { strict: true }) : [...(order ?? nextTracks.keys())];
    this.#commitGraph(this.#prepareGraph(nodes, edges, resolvedOrder, nextTracks));
    this.#attachHooks();
  }
  get graphOrder() { return [...this.#order]; }
  get trackCount() { return this.#tracks.size; }
  get isDestroyed() { return this.#destroyed; }
  // Invalidation is inert after disposal rather than fatal: it arrives from
  // Track lifecycle events, which can still be in flight during teardown.
  markDirty(trackId) { if (this.#destroyed) return; if (!this.#tracks.has(trackId)) { if (this.#strict) throw new Error(`Unknown track id '${trackId}'.`); return; } this.#marked.add(trackId); }
  markAllDirty() { if (this.#destroyed) return; for (const id of this.#tracks.keys()) this.#marked.add(id); }
  resetRetry(trackId) { if (this.#destroyed) return; if (!this.#tracks.has(trackId)) { if (this.#strict) throw new Error(`Unknown track id '${trackId}'.`); return; } this.#retryState.delete(trackId); this.#publishPending.add(trackId); }
  flush() {
    if (this.#destroyed) return 0;
    this.#flushNumber += 1;
    if (this.#marked.size === 0 && this.#publishPending.size === 0 && this.#isWarm()) return 0;
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
      if (upstream.some((sourceId) => blocked.has(sourceId))) { blocked.add(id); this.#marked.add(id); continue; }
      const stateChanged = marked.has(id) || upstream.some((sourceId) => changed.has(sourceId));
      const shouldRetry = retrying.has(id);
      const needsCompose = stateChanged || shouldRetry || !this.#cache.has(id);
      if (!needsCompose) { composed.set(id, this.#cache.get(id)); continue; }
      let patch;
      try { patch = track.compose(undefined, composed); }
      catch (error) { failures.push(error); blocked.add(id); this.#marked.add(id); continue; }
      this.#cache.set(id, patch);
      composed.set(id, patch);
      if (!stateChanged && !shouldRetry) continue;
      if (stateChanged) changed.add(id);
      try {
        this.#publish(id, patch);
        published += 1;
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
    for (const id of [...this.#marked]) if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#marked.delete(id);
    for (const id of [...this.#publishPending]) if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#publishPending.delete(id);
    for (const id of [...this.#retryState.keys()]) if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#retryState.delete(id);
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
    for (const [id, track] of nextTracks) if (!previousTracks.has(id) || previousTracks.get(id) !== track) invalidationSeeds.add(id);
    for (const id of previousIds) if (!nextTracks.has(id)) invalidationSeeds.add(id);
    const edgeKey = (edge) => `${edge.source}${edge.target}${edge.role ?? "output"}${edge.input ?? ""}`;
    const previousEdgeKeys = new Map(previousEdges.map((edge) => [edgeKey(edge), edge]));
    const nextEdgeKeys = new Map(state.edges.map((edge) => [edgeKey(edge), edge]));
    for (const [key, edge] of previousEdgeKeys) if (!nextEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
    for (const [key, edge] of nextEdgeKeys) if (!previousEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
    this.#detachHooks();
    this.#commitGraph(state);
    this.#attachHooks();
    for (const id of previousIds) if (!this.#tracks.has(id)) { this.#cache.delete(id); this.#marked.delete(id); this.#publishPending.delete(id); this.#retryState.delete(id); }
    for (const id of invalidationSeeds) { if (!this.#tracks.has(id)) continue; this.#cache.delete(id); this.#publishPending.delete(id); this.#retryState.delete(id); this.#marked.add(id); }
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
    if (track.id !== id) throw new Error(`Track id '${track.id}' does not match registration id '${id}'.`);
    if (this.#tracks.has(id)) throw new Error(`Duplicate track id '${id}'.`);
    const nodes = [...this.#order.map((existing) => ({ id: existing })), { id }];
    const edges = [...this.#edges, ...(options.observes ?? []).map((edge) => ({ ...edge, target: id }))];
    const nextTracks = new Map(this.#tracks).set(id, track);
    const state = this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), nextTracks);
    this.#commitGraph(state);
    this.#attachHooks();
    this.#marked.add(id);
  }
  addEdge(edge) {
    this.#assertAlive();
    const edges = [...this.#edges, { source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.role === "input" ? edge.target : undefined }];
    const nodes = this.#order.map((id) => ({ id }));
    this.#commitGraph(this.#prepareGraph(nodes, edges, buildTopologicalOrder(nodes, edges), this.#tracks));
    this.#marked.add(edge.target);
    this.#cache.delete(edge.target);
  }
  removeEdge(edge) {
    this.#assertAlive();
    const edges = this.#edges.filter((existing) => !(existing.source === edge.source && existing.target === edge.target && (edge.role === undefined || existing.role === edge.role)));
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
   */
  removeTrack(id) {
    if (this.#destroyed || !this.#tracks.has(id)) return;
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
    this.#edges = [];
    this.#order = [];
  }
  #assertAlive() { if (this.#destroyed) throw new Error("GraphPublisher is destroyed."); }
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
    for (const id of nodeIds) if (!tracks.has(id)) throw new Error(`Graph node '${id}' has no registered track.`);
    for (const id of tracks.keys()) if (!nodeIds.has(id)) throw new Error(`Registered track '${id}' is missing from the graph.`);
    const nextOrder = [...order];
    if (nextOrder.length !== nodeIds.size) throw new Error(`Publish order covers ${nextOrder.length} of ${nodeIds.size} graph nodes.`);
    const rank = new Map();
    for (const id of nextOrder) {
      if (!nodeIds.has(id)) throw new Error(`Publish order references unknown node '${id}'.`);
      if (rank.has(id)) throw new Error(`Publish order lists '${id}' more than once.`);
      rank.set(id, rank.size);
    }
    const nextEdges = edges.map((edge) => ({ source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.input }));
    const upstream = new Map([...nodeIds].map((id) => [id, []]));
    for (const edge of nextEdges) {
      if (!upstream.has(edge.source)) throw new Error(`Graph edge sources unknown track '${edge.source}'.`);
      if (!upstream.has(edge.target)) throw new Error(`Graph edge targets unknown track '${edge.target}'.`);
      // The order is the schedule. An edge it does not respect means a
      // dependent composes before its source and reads a stale patch.
      if (rank.get(edge.source) >= rank.get(edge.target)) throw new Error(`Publish order violates edge '${edge.source}' -> '${edge.target}'.`);
      upstream.get(edge.target).push(edge.source);
    }
    return { order: nextOrder, edges: nextEdges, upstream, tracks };
  }
  #commitGraph(state) { this.#order = state.order; this.#edges = state.edges; this.#upstream = state.upstream; this.#tracks = state.tracks; }
  #isWarm() { for (const [id, track] of this.#tracks) { if (track?.isDestroyed) continue; if (!this.#cache.has(id)) return false; } return true; }
  #canRetry(id) { const state = this.#retryState.get(id); return !state || state.nextRetryFlush <= this.#flushNumber; }
  #recordPublishFailure(id) { const previous = this.#retryState.get(id); const attempts = (previous?.attempts ?? 0) + 1; const exhausted = attempts >= this.#retry.maxAttempts; this.#retryState.set(id, { attempts, exhausted, nextRetryFlush: this.#flushNumber + this.#retry.backoff + 1 }); if (!exhausted) this.#publishPending.add(id); else this.#publishPending.delete(id); }
  /**
   * `onExhausted` used to be accepted, validated and then never read: an
   * exhausted node always stopped retrying regardless. Configuration that does
   * nothing is worse than no configuration, so it is rejected loudly now.
   */
  #normalizeRetry(retry = {}) {
    if (retry === null || typeof retry !== "object" || Array.isArray(retry)) throw new TypeError("retry must be an object.");
    for (const key of Object.keys(retry)) {
      if (!RETRY_OPTIONS.has(key)) throw new TypeError(`Unknown retry option '${key}'. Supported options are maxAttempts and backoff.`);
    }
    const maxAttempts = retry.maxAttempts === undefined ? Infinity : Number(retry.maxAttempts);
    const backoff = retry.backoff === undefined ? 0 : Number(retry.backoff);
    if (!(maxAttempts > 0) || (!Number.isInteger(maxAttempts) && maxAttempts !== Infinity)) throw new TypeError("retry.maxAttempts must be a positive integer or Infinity.");
    if (!(backoff >= 0) || !Number.isInteger(backoff)) throw new TypeError("retry.backoff must be a non-negative integer.");
    return { maxAttempts, backoff };
  }
  #markDownstream(seeds) { const queue = [...seeds].filter((id) => this.#tracks.has(id)); const seen = new Set(queue); while (queue.length) { const sourceId = queue.shift(); for (const [targetId, upstream] of this.#upstream) { if (!upstream.includes(sourceId) || seen.has(targetId)) continue; seen.add(targetId); this.#cache.delete(targetId); this.#publishPending.delete(targetId); this.#retryState.delete(targetId); this.#marked.add(targetId); queue.push(targetId); } } }
  #graphGuard = (observer, source) => { if (!this.#tracks.has(observer.id) || !this.#tracks.has(source.id)) return; const seen = new Set(); const queue = [source]; while (queue.length) { const current = queue.shift(); if (current === observer) throw new Error(`Observing "${source.id}" from "${observer.id}" would create a cycle.`); if (seen.has(current.id)) continue; seen.add(current.id); for (const edge of current.observedEdges ?? []) queue.push(edge.source); } };
  #attachHooks() { if (this.#destroyed) return; for (const [id, track] of this.#tracks) { if (this.#hooks.has(id)) continue; track._setGraphGuard?.(this.#graphGuard); const unsubscribe = track.onLifecycle?.((event) => { if (event.type === "invalidated") this.markDirty(id); if (event.type === "destroyed" || event.type === "detached") this.removeTrack(id); }); this.#hooks.set(id, unsubscribe ?? (() => {})); } }
  #detachHook(id) { this.#hooks.get(id)?.(); this.#hooks.delete(id); this.#tracks.get(id)?._setGraphGuard?.(null); }
  #detachHooks() { for (const id of [...this.#hooks.keys()]) this.#detachHook(id); }
}
