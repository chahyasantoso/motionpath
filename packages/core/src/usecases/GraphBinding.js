import { observationEdgeEquals, observationEdgeKey } from "./observationEdge.js";
import { normalizeObservationGraph, topologicalTrackOrder } from "./normalizeObservationGraph.js";

/**
 * The bridge between live Track edges and GraphPublisher metadata.
 *
 * Before this existed there were four graph representations (authored schema,
 * normalized IR, mounted Track references, publisher order) and nothing kept
 * them in agreement after a runtime mutation. Track owns edge lifecycle,
 * GraphPublisher owns scheduling, and GraphBinding owns the transaction that
 * moves both at once or neither at all.
 */
export class GraphBinding {
  #tracks;
  #publisher;
  #graph;
  #unsubscribers = [];
  #destroyed = false;

  constructor({ graph, tracks = new Map(), publisher } = {}) {
    if (!publisher || typeof publisher.applyGraph !== "function") throw new TypeError("GraphBinding requires a graph-aware publisher.");
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#publisher = publisher;
    this.#graph = this.#freeze(graph);
    this.#assertTrackGraphMatches();
    this.#syncPublisher();
    this.#subscribe();
  }
  get graph() { return this.#graph; }
  get tracks() { return new Map(this.#tracks); }
  replaceEdge(oldEdge, newEdge) {
    this.#assertAlive();
    const observer = this.#tracks.get(oldEdge.target ?? newEdge.target);
    const oldSource = this.#tracks.get(oldEdge.source);
    const newSource = this.#tracks.get(newEdge.source);
    if (!observer || !oldSource || !newSource) throw new Error("replaceEdge references an unknown track.");
    const candidate = this.#candidateGraph((edges) => [...edges.filter((edge) => !observationEdgeEquals(edge, { ...oldEdge, target: observer.id })), this.#normalizeEdge({ ...newEdge, target: observer.id })]);
    observer.replaceObserved(oldSource, newSource, newEdge.mapFn, { role: newEdge.role ?? oldEdge.role, target: (newEdge.role ?? oldEdge.role) === "input" ? newEdge.input ?? newEdge.target : undefined });
    this.#commit(candidate);
  }
  addEdge(edge) {
    this.#assertAlive();
    const observer = this.#tracks.get(edge.target);
    const source = this.#tracks.get(edge.source);
    if (!observer || !source) throw new Error("addEdge references an unknown track.");
    const candidate = this.#candidateGraph((edges) => [...edges, this.#normalizeEdge(edge)]);
    observer.setObserved(source, edge.mapFn ?? null, { role: edge.role ?? "output", target: edge.role === "input" ? edge.input ?? edge.target : undefined });
    this.#commit(candidate);
  }
  removeEdge(edge) {
    this.#assertAlive();
    const observer = this.#tracks.get(edge.target);
    const source = this.#tracks.get(edge.source);
    if (!observer || !source) return;
    const candidate = this.#candidateGraph((edges) => edges.filter((existing) => !observationEdgeEquals(existing, this.#normalizeEdge(edge))));
    observer.removeObserved(source, { role: edge.role, target: edge.input });
    this.#commit(candidate);
  }
  addTrack(track, observesOrOptions = []) {
    this.#assertAlive();
    const observes = Array.isArray(observesOrOptions) ? observesOrOptions : observesOrOptions.observes ?? [];
    if (!track?.id) throw new TypeError("addTrack requires a Track with an id.");
    if (this.#tracks.has(track.id)) throw new Error(`Duplicate track id '${track.id}'.`);
    const candidate = this.#candidateGraph((edges) => [...edges, ...observes.map((edge) => this.#normalizeEdge({ ...edge, target: track.id }))], (nodes) => [...nodes, { id: track.id }]);
    this.#tracks.set(track.id, track);
    try {
      for (const edge of observes) {
        const source = this.#tracks.get(edge.source);
        if (!source) throw new Error(`Unknown source track '${edge.source}'.`);
        track.setObserved(source, edge.mapFn ?? null, { role: edge.role ?? "output", target: edge.role === "input" ? edge.input ?? edge.target : undefined });
      }
      this.#commit(candidate);
      this.#subscribeTrack(track);
    } catch (error) { this.#tracks.delete(track.id); throw error; }
  }
  removeTrack(id) {
    if (this.#destroyed || !this.#tracks.has(id)) return;
    const track = this.#tracks.get(id);
    const candidate = this.#candidateGraph((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id), (nodes) => nodes.filter((node) => node.id !== id));
    this.#tracks.delete(id);
    if (!track.isDestroyed) track.destroy?.();
    this.#commit(candidate);
  }
  destroy() { if (this.#destroyed) return; this.#destroyed = true; for (const unsubscribe of this.#unsubscribers) unsubscribe(); this.#unsubscribers = []; }
  #normalizeEdge(edge) { const role = edge.role ?? "output"; return { source: edge.source, target: edge.target, role, input: role === "input" ? edge.input ?? edge.target : undefined }; }
  #freeze(graph) {
    if (!graph || graph.errors?.length) throw new Error("GraphBinding requires a valid normalized graph.");
    topologicalTrackOrder(graph, { strict: true });
    return Object.freeze({ valid: true, nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map(({ source, target, role, input }) => ({ source, target, role, input })), order: [...graph.order], errors: [] });
  }
  #assertTrackGraphMatches() {
    const live = [];
    for (const track of this.#tracks.values()) for (const edge of track.observedEdges ?? []) live.push({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input });
    const declared = this.#graph.edges;
    const key = (edge) => `${observationEdgeKey(edge.source, edge.role, edge.input)}->${edge.target}`;
    const declaredKeys = new Set(declared.map(key));
    if (live.length !== declared.length || live.some((edge) => !declaredKeys.has(key(edge)))) throw new Error(`GraphBinding found ${live.length} live observation edges but ${declared.length} declared edges. Live Track wiring and the normalized graph must agree.`);
  }
  #candidateGraph(edgeMutator, nodeMutator = (nodes) => nodes) {
    const nodes = nodeMutator(this.#graph.nodes.map((node) => ({ id: node.id })));
    const edges = edgeMutator(this.#graph.edges.map((edge) => ({ ...edge })));
    const normalized = normalizeObservationGraph({ tracks: nodes.map((node) => ({ id: node.id, observes: edges.filter((edge) => edge.target === node.id).map((edge) => ({ source: edge.source, role: edge.role, target: edge.role === "input" ? edge.input : undefined })) })) });
    if (!normalized.valid) throw new Error(`Rejected graph mutation: ${normalized.errors.map((error) => error.message).join("; ")}`);
    return normalized;
  }
  #commit(graph) { this.#graph = this.#freeze(graph); this.#syncPublisher(); }
  #syncPublisher() { this.#publisher.applyGraph(this.#graph, this.#tracks); }
  #subscribe() { for (const track of this.#tracks.values()) this.#subscribeTrack(track); }
  #subscribeTrack(track) {
    const unsubscribe = track.onLifecycle?.((event) => { if (!this.#destroyed && event.type === "destroyed") this.removeTrack(event.track.id); });
    if (unsubscribe) this.#unsubscribers.push(unsubscribe);
    const unsubscribeDestroyed = track.onSourceDestroyed?.((event) => { if (!this.#destroyed && this.#tracks.has(event.id)) this.removeTrack(event.id); });
    if (unsubscribeDestroyed) this.#unsubscribers.push(unsubscribeDestroyed);
  }
  #assertAlive() { if (this.#destroyed) throw new Error("GraphBinding is destroyed."); }
}
