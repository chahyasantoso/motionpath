import { buildTopologicalOrder, topologicalTrackOrder } from "./normalizeObservationGraph.js";

/**
 * Composes and publishes a validated observation graph in topological order.
 * Track owns per-call memoization and local edges; this class owns
 * cross-flush scheduling, dependency propagation and the persistent cache.
 */
export class GraphPublisher {
  #order = [];
  #tracks = new Map();
  #upstream = new Map();
  #edges = [];
  #marked = new Set();
  #publishPending = new Set();
  #cache = new Map();
  #hooks = new Map();
  #publish;
  #strict;

  constructor({ graph, order, tracks = new Map(), publish, strict = true } = {}) {
    if (typeof publish !== "function") throw new TypeError("GraphPublisher requires a publish callback.");
    this.#publish = publish;
    this.#strict = strict;
    this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
    for (const [id, track] of this.#tracks) if (!track || track.id !== id) throw new Error(`Track registration mismatch for '${id}'.`);
    if (graph) this.#adoptGraph(graph.nodes?.map(({ id }) => ({ id })) ?? [], graph.edges ?? [], topologicalTrackOrder(graph, { strict: true }));
    else this.#adoptGraph([...this.#tracks.keys()].map((id) => ({ id })), [], [...(order ?? [])]);
    this.#attachHooks();
  }

  get graphOrder() { return [...this.#order]; }
  get trackCount() { return this.#tracks.size; }

  markDirty(trackId) {
    if (!this.#tracks.has(trackId)) {
      if (this.#strict) throw new Error(`Unknown track id '${trackId}'.`);
      return;
    }
    this.#marked.add(trackId);
  }

  markAllDirty() { for (const id of this.#tracks.keys()) this.#marked.add(id); }

  flush() {
    if (this.#marked.size === 0 && this.#publishPending.size === 0 && this.#isWarm()) return 0;
    const marked = new Set(this.#marked);
    const retrying = new Set(this.#publishPending);
    const changed = new Set();
    const blocked = new Set();
    const failures = [];
    const composed = new Map();
    let published = 0;

    for (const id of this.#order) {
      const track = this.#tracks.get(id);
      if (!track || track.isDestroyed) continue;
      const upstream = this.#upstream.get(id) ?? [];
      if (upstream.some((sourceId) => blocked.has(sourceId))) {
        blocked.add(id);
        this.#marked.add(id);
        continue;
      }
      const stateChanged = marked.has(id) || upstream.some((sourceId) => changed.has(sourceId));
      const needsCompose = stateChanged || retrying.has(id) || !this.#cache.has(id);
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
      if (!stateChanged && !retrying.has(id)) continue;

      // A publish retry is not a state change. It must not force valid,
      // unchanged downstream patches to republish.
      if (stateChanged) changed.add(id);
      try {
        this.#publish(id, patch);
        published += 1;
        this.#marked.delete(id);
        this.#publishPending.delete(id);
      } catch (error) {
        failures.push(error);
        this.#publishPending.add(id);
        this.#marked.delete(id);
      }
    }

    for (const id of [...this.#marked]) if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#marked.delete(id);
    for (const id of [...this.#publishPending]) if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#publishPending.delete(id);
    if (failures.length) throw new AggregateError(failures, "GraphPublisher flush failed.");
    return published;
  }

  applyGraph(graph, tracks = this.#tracks) {
    const order = topologicalTrackOrder(graph, { strict: true });
    this.#detachHooks();
    this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
    this.#adoptGraph(graph.nodes?.map(({ id }) => ({ id })) ?? [], graph.edges ?? [], order);
    this.#attachHooks();
    this.#cache.clear();
    this.#publishPending.clear();
    this.#marked = new Set(this.#tracks.keys());
  }

  addTrack(idOrTrack, trackOrOptions, maybeOptions) {
    const idFirst = typeof idOrTrack === "string";
    const track = idFirst ? trackOrOptions : idOrTrack;
    const id = idFirst ? idOrTrack : track?.id;
    const options = (idFirst ? maybeOptions : trackOrOptions) ?? {};
    if (!track || typeof track.compose !== "function") throw new TypeError("addTrack requires a Track.");
    if (track.id !== id) throw new Error(`Track id '${track.id}' does not match registration id '${id}'.`);
    if (this.#tracks.has(id)) throw new Error(`Duplicate track id '${id}'.`);
    const nodes = [...this.#order.map((existing) => ({ id: existing })), { id }];
    const edges = [...this.#edges, ...(options.observes ?? []).map((edge) => ({ ...edge, target: id }))];
    const order = buildTopologicalOrder(nodes, edges);
    this.#tracks.set(id, track);
    this.#adoptGraph(nodes, edges, order);
    this.#attachHooks();
    this.#marked.add(id);
  }

  addEdge(edge) {
    const edges = [...this.#edges, { source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.role === "input" ? edge.target : undefined }];
    const nodes = this.#order.map((id) => ({ id }));
    this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges));
    this.#marked.add(edge.target);
    this.#cache.delete(edge.target);
  }

  removeEdge(edge) {
    const edges = this.#edges.filter((existing) => !(existing.source === edge.source && existing.target === edge.target && (edge.role === undefined || existing.role === edge.role)));
    const nodes = this.#order.map((id) => ({ id }));
    this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges));
    this.#marked.add(edge.target);
    this.#cache.delete(edge.target);
  }

  removeTrack(id) {
    if (!this.#tracks.has(id)) return;
    this.#detachHook(id);
    this.#tracks.delete(id);
    const nodes = this.#order.filter((existing) => existing !== id).map((existing) => ({ id: existing }));
    const edges = this.#edges.filter((edge) => edge.source !== id && edge.target !== id);
    this.#adoptGraph(nodes, edges, buildTopologicalOrder(nodes, edges));
    this.#cache.delete(id);
    this.#marked.delete(id);
    this.#publishPending.delete(id);
  }

  destroy() { this.#detachHooks(); this.#cache.clear(); this.#marked.clear(); this.#publishPending.clear(); }
  #isWarm() { for (const [id, track] of this.#tracks) { if (track?.isDestroyed) continue; if (!this.#cache.has(id)) return false; } return true; }
  #adoptGraph(nodes, edges, order) { this.#order = [...order]; this.#edges = edges.map((edge) => ({ source: edge.source, target: edge.target, role: edge.role ?? "output", input: edge.input })); this.#upstream = new Map(nodes.map(({ id }) => [id, []])); for (const id of this.#order) if (!this.#upstream.has(id)) this.#upstream.set(id, []); for (const edge of this.#edges) { if (!this.#upstream.has(edge.target)) throw new Error(`Graph edge targets unknown track '${edge.target}'.`); this.#upstream.get(edge.target).push(edge.source); } }

  #graphGuard = (observer, source) => {
    if (!this.#tracks.has(observer.id) || !this.#tracks.has(source.id)) return;
    const seen = new Set();
    const queue = [source];
    while (queue.length) {
      const current = queue.shift();
      if (current === observer) throw new Error(`Observing "${source.id}" from "${observer.id}" would create a cycle.`);
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      for (const edge of current.observedEdges ?? []) queue.push(edge.source);
    }
  };

  #attachHooks() {
    for (const [id, track] of this.#tracks) {
      if (this.#hooks.has(id)) continue;
      track._setGraphGuard?.(this.#graphGuard);
      const unsubscribe = track.onLifecycle?.((event) => { if (event.type === "invalidated") this.markDirty(id); if (event.type === "destroyed") this.removeTrack(id); });
      this.#hooks.set(id, unsubscribe ?? (() => {}));
    }
  }
  #detachHook(id) { this.#hooks.get(id)?.(); this.#hooks.delete(id); this.#tracks.get(id)?._setGraphGuard?.(null); }
  #detachHooks() { for (const id of [...this.#hooks.keys()]) this.#detachHook(id); }
}
