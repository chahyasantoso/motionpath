import { topologicalTrackOrder } from "./normalizeObservationGraph.js";

/**
 * Composes and publishes a validated observation graph in topological order.
 * Track owns per-call memoization; this class owns cross-flush scheduling and
 * the persistent patch cache.
 */
export class GraphPublisher {
  #order = [];
  #tracks = new Map();
  #upstream = new Map();
  #marked = new Set();
  #cache = new Map();
  #publish;
  #strict;

  constructor({ graph, order, tracks = new Map(), publish, strict = true } = {}) {
    if (typeof publish !== "function") throw new TypeError("GraphPublisher requires a publish callback.");
    this.#publish = publish;
    this.#strict = strict;
    this.#tracks = tracks;
    if (graph) this.#applyGraph(graph);
    else {
      this.#order = [...(order ?? [])];
      this.#upstream = new Map(this.#order.map((id) => [id, []]));
    }
    this.#validateTrackIds();
    this.#attachInvalidationHooks();
  }

  get graphOrder() { return [...this.#order]; }

  markDirty(trackId) {
    if (!this.#tracks.has(trackId)) {
      if (this.#strict) throw new Error(`Unknown track id '${trackId}'.`);
      return;
    }
    this.#marked.add(trackId);
  }

  markAllDirty() { for (const id of this.#tracks.keys()) this.#marked.add(id); }

  flush() {
    if (this.#marked.size === 0 && this.#cache.size === this.#tracks.size) return 0;
    const marked = new Set(this.#marked);
    const recomposed = new Set();
    const failures = [];
    let published = 0;
    const composed = new Map();

    for (const id of this.#order) {
      const track = this.#tracks.get(id);
      if (!track || track.isDestroyed) continue;
      const upstream = this.#upstream.get(id) ?? [];
      const upstreamChanged = upstream.some((sourceId) => recomposed.has(sourceId));
      const needsCompose = marked.has(id) || !this.#cache.has(id) || upstreamChanged;
      if (!needsCompose) {
        composed.set(id, this.#cache.get(id));
        continue;
      }
      if (upstream.some((sourceId) => failures.some((failure) => failure.id === sourceId))) continue;
      try {
        const patch = track.compose(undefined, composed);
        this.#cache.set(id, patch);
        composed.set(id, patch);
        recomposed.add(id);
        if (marked.has(id) || upstreamChanged) {
          this.#publish(id, patch);
          published += 1;
          this.#marked.delete(id);
        }
      } catch (error) {
        failures.push({ id, error });
      }
    }

    for (const id of [...this.#marked]) {
      if (!this.#tracks.has(id) || this.#tracks.get(id)?.isDestroyed) this.#marked.delete(id);
    }
    if (failures.length) throw new AggregateError(failures.map(({ error }) => error), "GraphPublisher flush failed.");
    return published;
  }

  applyGraph(graph, tracks = this.#tracks) {
    this.#tracks = tracks;
    this.#applyGraph(graph);
    this.#validateTrackIds();
    this.#attachInvalidationHooks();
    this.#marked = new Set(this.#tracks.keys());
  }

  addTrack(idOrTrack, trackOrOptions, maybeOptions = {}) {
    const track = typeof idOrTrack === "string" ? trackOrOptions : idOrTrack;
    const id = typeof idOrTrack === "string" ? idOrTrack : track?.id;
    if (!track || id !== track.id) throw new TypeError("addTrack requires a Track whose id matches the registration id.");
    if (this.#tracks.has(id)) throw new Error(`Duplicate track id '${id}'.`);
    this.#tracks.set(id, track);
    const options = typeof idOrTrack === "string" ? maybeOptions : trackOrOptions ?? {};
    const observes = options.observes ?? [];
    const nextGraph = this.#graphSnapshot();
    nextGraph.nodes.push({ id, index: nextGraph.nodes.length });
    for (const edge of observes) nextGraph.edges.push({ ...edge, target: id });
    nextGraph.order = topologicalTrackOrderFromEdges(nextGraph.nodes, nextGraph.edges);
    this.#applyGraph(nextGraph);
    this.#attachInvalidationHooks();
    this.#marked.add(id);
  }

  addEdge(edge) {
    const graph = this.#graphSnapshot();
    graph.edges.push({ ...edge, input: edge.role === "input" ? edge.target : undefined });
    graph.order = topologicalTrackOrderFromEdges(graph.nodes, graph.edges);
    this.#applyGraph(graph);
    this.#marked = new Set(this.#tracks.keys());
  }

  removeTrack(id) {
    if (!this.#tracks.has(id)) return;
    this.#tracks.delete(id);
    const graph = this.#graphSnapshot();
    graph.nodes = graph.nodes.filter((node) => node.id !== id);
    graph.edges = graph.edges.filter((edge) => edge.source !== id && edge.target !== id);
    graph.order = topologicalTrackOrderFromEdges(graph.nodes, graph.edges);
    this.#applyGraph(graph);
    this.#cache.delete(id);
    this.#marked.delete(id);
  }

  #applyGraph(graph) {
    if (graph?.errors?.length) throw new Error(`Cannot publish invalid graph: ${graph.errors.map((error) => error.message).join("; ")}`);
    this.#order = topologicalTrackOrder(graph, { strict: true });
    this.#upstream = new Map(this.#order.map((id) => [id, []]));
    for (const edge of graph?.edges ?? []) {
      if (!this.#upstream.has(edge.target)) throw new Error(`Graph edge targets unknown track '${edge.target}'.`);
      this.#upstream.get(edge.target).push(edge.source);
    }
  }

  #graphSnapshot() {
    const edges = [];
    for (const [target, sources] of this.#upstream) for (const source of sources) edges.push({ source, target, role: "output" });
    return { nodes: this.#order.map((id, index) => ({ id, index })), edges, order: [...this.#order], errors: [] };
  }

  #validateTrackIds() {
    for (const [id, track] of this.#tracks) {
      if (!track || track.id !== id) throw new Error(`Track registration mismatch for '${id}'.`);
    }
  }

  #attachInvalidationHooks() {
    for (const [id, track] of this.#tracks) track.onLifecycle?.((event) => {
      if (event.type === "invalidated") this.markDirty(id);
      if (event.type === "destroyed") this.removeTrack(id);
    });
  }
}

function topologicalTrackOrderFromEdges(nodes, edges) {
  const indegree = new Map(nodes.map(({ id }) => [id, 0]));
  const outgoing = new Map(nodes.map(({ id }) => [id, []]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) throw new Error("Graph edge references an unknown track.");
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter(({ id }) => indegree.get(id) === 0).map(({ id }) => id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const target of outgoing.get(id)) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (order.length !== nodes.length) throw new Error("Observation graph contains a cycle.");
  return order;
}
