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
 *
 * Every mutation runs the same six stages:
 *
 *   prepare    build the candidate edge and node sets
 *   resolve    look up every Track the mutation names, before touching any
 *   validate   normalize the candidate and reject cycles and duplicates
 *   wire       apply the change to live Track state, recording an inverse
 *   commit     hand the candidate to the publisher, then adopt it
 *   invalidate the publisher seeds its dirty set from the committed diff
 *
 * A failure at any stage unwinds the recorded inverses in reverse order, so a
 * mutation that dies on its third edge leaves live wiring, the IR and the
 * publish order exactly as they were before the first.
 *
 * Ownership: a GraphBinding owns the publisher it is constructed with unless
 * the caller opts out with `ownsPublisher: false`.
 */
export class GraphBinding {
  #tracks;
  #publisher;
  #graph;
  #ownsPublisher;
  #unsubscribers = [];
  #destroyed = false;

  constructor({ graph, tracks = new Map(), publisher, ownsPublisher = true } = {}) {
    if (!publisher || typeof publisher.applyGraph !== "function") throw new TypeError("GraphBinding requires a graph-aware publisher.");
    this.#tracks = tracks instanceof Map ? new Map(tracks) : new Map(tracks);
    this.#publisher = publisher;
    this.#ownsPublisher = ownsPublisher !== false;
    this.#graph = this.#freeze(graph);
    this.#assertTrackGraphMatches();
    this.#syncPublisher();
    this.#subscribe();
  }
  get graph() { return this.#graph; }
  get tracks() { return new Map(this.#tracks); }
  get publisher() { return this.#publisher; }
  get isDestroyed() { return this.#destroyed; }
  replaceEdge(oldEdge, newEdge) {
    this.#assertAlive();
    const observer = this.#tracks.get(oldEdge.target ?? newEdge.target);
    const oldSource = this.#tracks.get(oldEdge.source);
    const newSource = this.#tracks.get(newEdge.source);
    if (!observer || !oldSource || !newSource) throw new Error("replaceEdge references an unknown track.");
    const candidate = this.#candidateGraph((edges) => [...edges.filter((edge) => !observationEdgeEquals(edge, { ...oldEdge, target: observer.id })), this.#normalizeEdge({ ...newEdge, target: observer.id })]);
    const role = newEdge.role ?? oldEdge.role;
    const input = role === "input" ? newEdge.input ?? newEdge.target : undefined;
    const replaced = observer.observedEdges.filter((edge) => edge.source === oldSource && (oldEdge.role === undefined || edge.role === oldEdge.role));
    this.#transaction(
      () => observer.replaceObserved(oldSource, newSource, newEdge.mapFn, { role, target: input }),
      () => {
        const [original] = replaced;
        if (original) observer.replaceObserved(newSource, oldSource, original.mapFn, { role: original.role, target: original.input });
      },
      candidate,
    );
  }
  addEdge(edge) {
    this.#assertAlive();
    const observer = this.#tracks.get(edge.target);
    const source = this.#tracks.get(edge.source);
    if (!observer || !source) throw new Error("addEdge references an unknown track.");
    const candidate = this.#candidateGraph((edges) => [...edges, this.#normalizeEdge(edge)]);
    const role = edge.role ?? "output";
    const input = role === "input" ? edge.input ?? edge.target : undefined;
    const previous = observer.observedEdges.find((existing) => existing.source === source && existing.role === role && existing.input === input);
    this.#transaction(
      () => observer.setObserved(source, edge.mapFn ?? null, { role, target: input }),
      () => {
        if (previous) observer.setObserved(source, previous.mapFn, { role, target: input });
        else observer.removeObserved(source, { role, target: input });
      },
      candidate,
    );
  }
  removeEdge(edge) {
    this.#assertAlive();
    const observer = this.#tracks.get(edge.target);
    const source = this.#tracks.get(edge.source);
    if (!observer || !source) return;
    const candidate = this.#candidateGraph((edges) => edges.filter((existing) => !observationEdgeEquals(existing, this.#normalizeEdge(edge))));
    const removed = observer.observedEdges.filter((existing) => existing.source === source
      && (edge.role === undefined || existing.role === edge.role)
      && (edge.role !== "input" || edge.input === undefined || existing.input === edge.input));
    this.#transaction(
      () => observer.removeObserved(source, { role: edge.role, target: edge.input }),
      () => { for (const original of removed) observer.setObserved(source, original.mapFn, { role: original.role, target: original.input }); },
      candidate,
    );
  }
  addTrack(track, observesOrOptions = []) {
    this.#assertAlive();
    const observes = Array.isArray(observesOrOptions) ? observesOrOptions : observesOrOptions.observes ?? [];
    if (!track?.id) throw new TypeError("addTrack requires a Track with an id.");
    if (this.#tracks.has(track.id)) throw new Error(`Duplicate track id '${track.id}'.`);
    // PREPARE and VALIDATE the whole candidate before anything moves.
    const candidate = this.#candidateGraph(
      (edges) => [...edges, ...observes.map((edge) => this.#normalizeEdge({ ...edge, target: track.id }))],
      (nodes) => [...nodes, { id: track.id }],
    );
    // RESOLVE every source up front. Resolving inside the wiring loop meant an
    // unknown source on edge three left edges one and two attached to a track
    // that was then dropped from the registry.
    const resolved = observes.map((edge) => {
      const source = this.#tracks.get(edge.source);
      if (!source) throw new Error(`Unknown source track '${edge.source}'.`);
      const role = edge.role ?? "output";
      return { source, role, input: role === "input" ? edge.input ?? edge.target : undefined, mapFn: edge.mapFn ?? null };
    });
    const previousGraph = this.#graph;
    const undo = [];
    this.#tracks.set(track.id, track);
    try {
      for (const { source, role, input, mapFn } of resolved) {
        track.setObserved(source, mapFn, { role, target: input });
        undo.push(() => track.removeObserved(source, { role, target: input }));
      }
      this.#commit(candidate);
      this.#subscribeTrack(track);
    } catch (error) {
      this.#unwind(undo);
      this.#tracks.delete(track.id);
      this.#graph = previousGraph;
      throw error;
    }
  }
  /**
   * `destroy: false` detaches a track that is still alive, which is what a
   * removeChild has to do. Destroying it there would kill a Track the caller
   * still holds.
   */
  removeTrack(id, { destroy = true } = {}) {
    if (this.#destroyed || !this.#tracks.has(id)) return;
    const track = this.#tracks.get(id);
    const candidate = this.#candidateGraph((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id), (nodes) => nodes.filter((node) => node.id !== id));
    this.#tracks.delete(id);
    if (destroy && !track.isDestroyed) track.destroy?.();
    this.#commit(candidate);
  }
  /**
   * Idempotent. Unsubscribes every lifecycle hook, releases the tracks it was
   * holding, and disposes the publisher it owns.
   */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    this.#tracks = new Map();
    const publisher = this.#publisher;
    this.#publisher = null;
    if (this.#ownsPublisher) publisher?.destroy?.();
  }
  /** WIRE, COMMIT, or unwind. The inverse runs only if something after it throws. */
  #transaction(wire, unwire, candidate) {
    const previousGraph = this.#graph;
    wire();
    try { this.#commit(candidate); }
    catch (error) { this.#unwind([unwire]); this.#graph = previousGraph; throw error; }
  }
  #unwind(steps) {
    for (const step of [...steps].reverse()) {
      // Best effort by definition: the transaction already failed, and a noisy
      // rollback would replace the real error with a less useful one.
      try { step(); } catch { /* keep unwinding */ }
    }
  }
  #normalizeEdge(edge) { const role = edge.role ?? "output"; return { source: edge.source, target: edge.target, role, input: role === "input" ? edge.input ?? edge.target : undefined }; }
  #freeze(graph) {
    if (!graph || graph.errors?.length) throw new Error("GraphBinding requires a valid normalized graph.");
    topologicalTrackOrder(graph, { strict: true });
    return Object.freeze({ valid: true, nodes: graph.nodes.map((node) => ({ ...node })), edges: graph.edges.map(({ source, target, role, input }) => ({ source, target, role, input })), order: [...graph.order], errors: [] });
  }
  /**
   * Membership in both directions, then edges in both directions. A one-way
   * check passed happily while a mounted Track was missing from the IR.
   */
  #assertTrackGraphMatches() {
    const declaredNodes = new Set(this.#graph.nodes.map((node) => node.id));
    for (const id of declaredNodes) if (!this.#tracks.has(id)) throw new Error(`GraphBinding graph declares node '${id}' with no live Track.`);
    for (const id of this.#tracks.keys()) if (!declaredNodes.has(id)) throw new Error(`GraphBinding holds Track '${id}' that the graph does not declare.`);
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
  /**
   * The publisher goes first. If it rejects the candidate, this binding must
   * still be holding the graph it had, so the caller's rollback has something
   * consistent to restore to.
   */
  #commit(graph) {
    const frozen = this.#freeze(graph);
    this.#publisher.applyGraph(frozen, this.#tracks);
    this.#graph = frozen;
  }
  #syncPublisher() { this.#publisher.applyGraph(this.#graph, this.#tracks); }
  #subscribe() { for (const track of this.#tracks.values()) this.#subscribeTrack(track); }
  #subscribeTrack(track) {
    const unsubscribe = track.onLifecycle?.((event) => {
      if (this.#destroyed) return;
      if (event.type === "destroyed") this.removeTrack(event.track.id);
      // A detached track is alive but no longer part of this motion's graph.
      if (event.type === "detached") this.removeTrack(event.track.id, { destroy: false });
    });
    if (unsubscribe) this.#unsubscribers.push(unsubscribe);
    const unsubscribeDestroyed = track.onSourceDestroyed?.((event) => { if (!this.#destroyed && this.#tracks.has(event.id)) this.removeTrack(event.id); });
    if (unsubscribeDestroyed) this.#unsubscribers.push(unsubscribeDestroyed);
  }
  #assertAlive() { if (this.#destroyed) throw new Error("GraphBinding is destroyed."); }
}
