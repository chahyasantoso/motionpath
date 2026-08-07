import { buildTopologicalOrder, topologicalTrackOrder } from "./normalizeObservationGraph.js";

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
    this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
    for (const [id, track] of this.#tracks) if (!track || track.id !== id) throw new Error(`Track registration mismatch for '${id}'.`);
    if (graph) this.#adoptGraph(graph.nodes?.map(({ id }) => ({ id })) ?? [], graph.edges ?? [], topologicalTrackOrder(graph, { strict: true }));
    else this.#adoptGraph([...this.#tracks.keys()].map((id) => ({ id })), [], [...(order ?? [])]);
    this.#attachHooks();
  }
  get graphOrder() { return [...this.#order]; }
  get trackCount() { return this.#tracks.size; }
  get isDestroyed() { return this.#destroyed; }
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
  applyGraph(graph, tracks = this.#tracks) {
    if (this.#destroyed) return;
    const order = topologicalTrackOrder(graph, { strict: true });
    const nextTracks = tracks instanceof Map ? tracks : new Map(tracks);
    const previousTracks = this.#tracks;
    const previousEdges = this.#edges;
    const invalidationSeeds = new Set();
    const previousIds = new Set(previousTracks.keys());
    for (const [id, track] of nextTracks) if (!previousTracks.has(id) || previousTracks.get(id) !== track) invalidationSeeds.add(id);
    for (const id of previousIds) if (!nextTracks.has(id)) invalidationSeeds.add(id);
    const edgeKey = (edge) => `${edge.source}${edge.target}${edge.role ?? "output"}${edge.input ?? ""}`;
    const previousEdgeKeys = new Map(previousEdges.map((edge) => [edgeKey(edge), edge]));
    const nextEdges = graph.edges ?? [];
    const nextEdgeKeys = new Map(nextEdges.map((edge) => [edgeKey(edge), edge]));
    for (const [key, edge] of previousEdgeKeys) if (!nextEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
    for (const [key, edge] of nextEdgeKeys) if (!previousEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
    this.#detachHooks(); this.#tracks = nextTracks; this.#adoptGraph(graph.nodes?.map(({ id }) => ({ id })) ?? [], nextEdges, order); this.#attachHooks();
    for (const id of previousIds) if (!this.#tracks.has(id)) { this.#cache.delete(id); this.#marked.delete(id); this.#publishPending.delete(id); this.#retryState.delete(id); }
    for (const id of invalidationSeeds) { if (!this.#tracks.has(id)) continue; this.#cache.delete(id); this.#publishPending.delete(id); this.#retryState.delete(id); this.#marked.add(id); }
    this.#markDownstream(invalidationSeeds);
  }
  addTrack(idOrTrack, trackOrOptions, maybeOptions) { if (this.#destroyed) return; const idFirst = typeof idOrTrack === "string"; const track = idFirst ? trackOrOptions : idOrTrack; const id = idFirst ? idOrTrack : track?.id; const options = (idFirst ? maybeOptions : trackOrOptions) ?? {}; if (!track || typeof track.compose !== "function") throw new TypeError("addTrack requires a Track."); if (track.id !== id) throw new Error(`Track id '${track.id}' does not match registration id '${id}'.`); if (this.#tracks.has(id)) throw new Error(`Duplicate track id '${id}'.`); const nodes = [...this.#order.map((existing) => ({ id: existing })), { id }]; const edges = [...this.#edges, ...(options.observes ?? []).map((edge) => ({ ...edge, target: id }))]; const order = buildTopologicalOrder(nodes, edges); this.#tracks.set(id, track); this.#adoptGraph(nodes, edges, order); this.#attachHooks(); this.#marked.add(id); }
  addEdge(edge) { if (this.#destroyed) return; const edges = [...this.#edges, { source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.role === "input" ? edge.target : undefined }]; const nodes = this.#order.map((id) => ({ id })); this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges)); this.#marked.add(edge.target); this.#cache.delete(edge.target); }
  removeEdge(edge) { if (this.#destroyed) return; const edges = this.#edges.filter((existing) => !(existing.source === edge.source && existing.target === edge.target && (edge.role === undefined || existing.role === edge.role))); const nodes = this.#order.map((id) => ({ id })); this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges)); this.#marked.add(edge.target); this.#cache.delete(edge.target); }
  /**
   * Retained deliberately through PR-02. The replacement destroy path does not
   * exist until the graph transaction work in PR-03, and removing this early
   * would leave a destroyed track wired into the publish order.
   */
  removeTrack(id) { if (this.#destroyed || !this.#tracks.has(id)) return; this.#detachHook(id); this.#tracks.delete(id); const nodes = this.#order.filter((existing) => existing !== id).map((existing) => ({ id: existing })); const edges = this.#edges.filter((edge) => edge.source !== id && edge.target !== id); this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges)); this.#cache.delete(id); this.#marked.delete(id); this.#publishPending.delete(id); this.#retryState.delete(id); }
  /**
   * Idempotent. Detaches every hook and graph guard first, then drops the
   * publisher's own references. The track map is REPLACED rather than cleared:
   * it is frequently the caller's map, and a disposal that mutates a collection
   * it does not own is how the previous teardown corrupted live state.
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
  #isWarm() { for (const [id, track] of this.#tracks) { if (track?.isDestroyed) continue; if (!this.#cache.has(id)) return false; } return true; }
  #canRetry(id) { const state = this.#retryState.get(id); return !state || state.nextRetryFlush <= this.#flushNumber; }
  #recordPublishFailure(id) { const previous = this.#retryState.get(id); const attempts = (previous?.attempts ?? 0) + 1; const exhausted = attempts >= this.#retry.maxAttempts; this.#retryState.set(id, { attempts, exhausted, nextRetryFlush: this.#flushNumber + this.#retry.backoff + 1 }); if (!exhausted) this.#publishPending.add(id); else this.#publishPending.delete(id); }
  #normalizeRetry(retry = {}) { const maxAttempts = retry.maxAttempts === undefined ? Infinity : Number(retry.maxAttempts); const backoff = retry.backoff === undefined ? 0 : Number(retry.backoff); const onExhausted = retry.onExhausted ?? "retain"; if (!(maxAttempts > 0) || (!Number.isInteger(maxAttempts) && maxAttempts !== Infinity)) throw new TypeError("retry.maxAttempts must be a positive integer or Infinity."); if (!(backoff >= 0) || !Number.isInteger(backoff)) throw new TypeError("retry.backoff must be a non-negative integer."); if (onExhausted !== "retain" && onExhausted !== "drop") throw new TypeError("retry.onExhausted must be 'retain' or 'drop'."); return { maxAttempts, backoff, onExhausted }; }
  #markDownstream(seeds) { const queue = [...seeds].filter((id) => this.#tracks.has(id)); const seen = new Set(queue); while (queue.length) { const sourceId = queue.shift(); for (const [targetId, upstream] of this.#upstream) { if (!upstream.includes(sourceId) || seen.has(targetId)) continue; seen.add(targetId); this.#cache.delete(targetId); this.#publishPending.delete(targetId); this.#retryState.delete(targetId); this.#marked.add(targetId); queue.push(targetId); } } }
  #adoptGraph(nodes, edges, order) { this.#order = [...order]; this.#edges = edges.map((edge) => ({ source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.input })); this.#upstream = new Map(nodes.map(({ id }) => [id, []])); for (const id of this.#order) if (!this.#upstream.has(id)) this.#upstream.set(id, []); for (const edge of this.#edges) { if (!this.#upstream.has(edge.target)) throw new Error(`Graph edge targets unknown track '${edge.target}'.`); this.#upstream.get(edge.target).push(edge.source); } }
  #graphGuard = (observer, source) => { if (!this.#tracks.has(observer.id) || !this.#tracks.has(source.id)) return; const seen = new Set(); const queue = [source]; while (queue.length) { const current = queue.shift(); if (current === observer) throw new Error(`Observing "${source.id}" from "${observer.id}" would create a cycle.`); if (seen.has(current.id)) continue; seen.add(current.id); for (const edge of current.observedEdges ?? []) queue.push(edge.source); } };
  #attachHooks() { if (this.#destroyed) return; for (const [id, track] of this.#tracks) { if (this.#hooks.has(id)) continue; track._setGraphGuard?.(this.#graphGuard); const unsubscribe = track.onLifecycle?.((event) => { if (event.type === "invalidated") this.markDirty(id); if (event.type === "destroyed") this.removeTrack(id); }); this.#hooks.set(id, unsubscribe ?? (() => {})); } }
  #detachHook(id) { this.#hooks.get(id)?.(); this.#hooks.delete(id); this.#tracks.get(id)?._setGraphGuard?.(null); }
  #detachHooks() { for (const id of [...this.#hooks.keys()]) this.#detachHook(id); }
}
