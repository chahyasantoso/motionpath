import { observationEdgeEquals, observationEdgeKey } from "./observationEdge.js";
import { normalizeObservationGraph, topologicalTrackOrder } from "./normalizeObservationGraph.js";

/** Keeps live Track edges and GraphPublisher metadata in sync. */
export class GraphBinding {
  #tracks;
  #publisher;
  #graph;
  #unsubscribers = [];
  #destroyed = false;

  constructor({ graph, tracks = new Map(), publisher } = {}) {
    if (!publisher || typeof publisher.applyGraph !== "function") throw new TypeError("GraphBinding requires a graph-aware publisher.");
    this.#tracks = new Map(tracks);
    this.#publisher = publisher;
    this.#graph = this.#validateGraph(graph);
    this.#assertTrackGraphMatches();
    this.#syncPublisher();
    this.#subscribe();
  }

  get graph() { return this.#graph; }
  get tracks() { return new Map(this.#tracks); }

  replaceEdge(oldEdge, newEdge) {
    this.#assertAlive();
    const observer = this.#tracks.get(oldEdge.target);
    const oldSource = this.#tracks.get(oldEdge.source);
    const newSource = this.#tracks.get(newEdge.source);
    if (!observer || !oldSource || !newSource) throw new Error("replaceEdge references an unknown track.");
    const candidate = this.#candidateGraph((graph) => {
      graph.edges = graph.edges.filter((edge) => !observationEdgeEquals(edge, oldEdge));
      graph.edges.push({ ...newEdge, input: newEdge.role === "input" ? newEdge.target : undefined });
    });
    observer.replaceObserved(oldSource, newSource, undefined, { role: oldEdge.role, target: newEdge.role === "input" ? newEdge.target : undefined });
    this.#commit(candidate);
  }

  addTrack(track, { observes = [] } = {}) {
    this.#assertAlive();
    if (!track?.id || this.#tracks.has(track.id)) throw new Error(`Duplicate track id '${track?.id}'.`);
    const candidate = this.#candidateGraph((graph) => {
      graph.nodes.push({ id: track.id, index: graph.nodes.length });
      for (const edge of observes) graph.edges.push({ ...edge, target: track.id });
    });
    this.#tracks.set(track.id, track);
    try {
      for (const edge of observes) {
        const source = this.#tracks.get(edge.source);
        if (!source) throw new Error(`Unknown source track '${edge.source}'.`);
        track.setObserved(source, edge.mapFn ?? null, { role: edge.role, target: edge.target });
      }
      this.#commit(candidate);
    } catch (error) {
      track.destroy?.();
      this.#tracks.delete(track.id);
      throw error;
    }
  }

  removeTrack(id) {
    this.#assertAlive();
    if (!this.#tracks.has(id)) return;
    const candidate = this.#candidateGraph((graph) => {
      graph.nodes = graph.nodes.filter((node) => node.id !== id);
      graph.edges = graph.edges.filter((edge) => edge.source !== id && edge.target !== id);
    });
    const track = this.#tracks.get(id);
    this.#tracks.delete(id);
    try {
      track.destroy?.();
      this.#commit(candidate);
    } catch (error) {
      this.#tracks.set(id, track);
      throw error;
    }
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
  }

  #validateGraph(graph) {
    if (!graph || graph.errors?.length) throw new Error("GraphBinding requires a valid normalized graph.");
    topologicalTrackOrder(graph);
    return { nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map((edge) => ({ ...edge })), order: [...graph.order], errors: [], valid: true };
  }

  #assertTrackGraphMatches() {
    const actual = [];
    for (const track of this.#tracks.values()) for (const edge of track.observedEdges ?? []) actual.push({ source: edge.source.id, target: track.id, role: edge.role, input: edge.input });
    const expected = this.#graph.edges.map(({ source, target, role, input }) => ({ source, target, role, input }));
    const same = actual.length === expected.length && actual.every((edge) => expected.some((candidate) => candidate.source === edge.source && candidate.target === edge.target && observationEdgeKey(candidate.source, candidate.role, candidate.input) === observationEdgeKey(edge.source, edge.role, edge.input)));
    if (!same) throw new Error("GraphBinding found a mismatch between normalized edges and live Track edges.");
  }

  #candidateGraph(mutator) {
    const graph = { nodes: this.#graph.nodes.map((node) => ({ ...node })), edges: this.#graph.edges.map((edge) => ({ ...edge })) };
    mutator(graph);
    const normalized = normalizeObservationGraph({ tracks: graph.nodes.map((node) => ({ id: node.id, observes: graph.edges.filter((edge) => edge.target === node.id).map((edge) => ({ source: edge.source, role: edge.role, target: edge.role === "input" ? edge.input : undefined })) })) });
    if (normalized.errors.length) throw new Error(normalized.errors.map((error) => error.message).join("; "));
    return normalized;
  }

  #commit(graph) { this.#graph = this.#validateGraph(graph); this.#syncPublisher(); }
  #syncPublisher() { this.#publisher.applyGraph(this.#graph, this.#tracks); }

  #subscribe() {
    for (const track of this.#tracks.values()) {
      const unsubscribe = track.onLifecycle?.((event) => {
        if (this.#destroyed) return;
        if (event.type === "invalidated") this.#publisher.markDirty(event.track.id);
        if (event.type === "destroyed") this.removeTrack(event.track.id);
      });
      if (unsubscribe) this.#unsubscribers.push(unsubscribe);
    }
  }

  #assertAlive() { if (this.#destroyed) throw new Error("GraphBinding is destroyed."); }
}
