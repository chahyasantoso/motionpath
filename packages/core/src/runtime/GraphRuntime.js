import { GraphBinding } from "../usecases/GraphBinding.js";
import { GraphPublisher } from "../usecases/GraphPublisher.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";
import { PatchRegistry } from "./PatchRegistry.js";

const MAX_DIAGNOSTICS = 50;

export class GraphRuntime {
  #publisher; #binding; #patches; #clockUnsubscribe = null; #disposed = false; #diagnostics = []; #flushInProgress = false;
  constructor({ graph, tracks = new Map(), clock = null, patches = new PatchRegistry(), enabled = true, initialEdges = [] } = {}) {
    if (!graph) throw new TypeError("GraphRuntime requires a normalized graph.");
    this.#patches = patches; this.enabled = enabled !== false;
    const publish = (nodeId, values) => { const track = this.#binding?.getTrack(nodeId); return this.#patches.publish(nodeId, values, { sourceProgress: track?.progress?.(), sourceRevisions: Object.fromEntries([...this.#patches.snapshot()].map(([id, patch]) => [id, patch.revision])) }); };
    this.#publisher = new GraphPublisher({ graph, tracks, publish });
    this.#binding = new GraphBinding({ graph, tracks, publisher: this.#publisher, initialEdges });
    if (clock) this.start(clock);
  }
  get isDisposed() { return this.#disposed; }
  get graph() { return this.#binding?.graph ?? null; }
  get binding() { return this.#binding; }
  get patches() { return this.#patches; }
  get diagnostics() { return [...this.#diagnostics]; }
  get publisher() { return this.#publisher; }
  get usePublisher() { return this.enabled; }
  get isRunning() { return this.#clockUnsubscribe !== null; }
  register(track, observes = []) { this.#assertAlive(); this.#binding.addTrack(track, { observes }); return track; }
  unregister(id, options) { this.#assertAlive(); this.#binding.removeTrack(id, options); }
  replaceEdges(oldEdge, newEdge) { this.#assertAlive(); this.#binding.replaceEdge(oldEdge, newEdge); }
  addEdge(edge) { this.#assertAlive(); this.#binding.addEdge(edge); }
  getPatch(nodeId) { return this.#patches.get(nodeId); }
  subscribe(nodeId, callback) { this.#assertAlive(); return this.#patches.subscribe(nodeId, callback); }
  compose(nodeId, rawData) { this.#assertAlive(); const track = this.#binding.getTrack(nodeId); if (!track) throw new Error(`Unknown runtime node '${nodeId}'.`); return track.compose(rawData); }
  flush() { if (this.#disposed || !this.enabled || this.#flushInProgress) return 0; this.#flushInProgress = true; this.#patches.beginBatch(); try { return this.#publisher.flush(); } finally { this.#patches.endBatch(); this.#flushInProgress = false; } }
  start(clock) { this.#assertAlive(); if (!clock || typeof clock.subscribe !== "function") throw new TypeError("GraphRuntime.start requires a clock."); if (this.#clockUnsubscribe) this.#clockUnsubscribe(); this.#publisher.markAllDirty(); this.#clockUnsubscribe = clock.subscribe(({ tick } = {}) => { this.lastTick = tick ?? (this.lastTick ?? 0) + 1; try { this.flush(); } catch (error) { this.#recordDiagnostic({ code: "GRAPH_FLUSH_FAILED", tick: this.lastTick, error }); } }); return this; }
  stop() { this.#clockUnsubscribe?.(); this.#clockUnsubscribe = null; return this; }
  dispose() { if (this.#disposed) return; this.#disposed = true; this.#clockUnsubscribe?.(); this.#clockUnsubscribe = null; this.#binding.destroy(); this.#binding = null; this.#publisher = null; }
  #recordDiagnostic(entry) { this.#diagnostics.push(entry); if (this.#diagnostics.length > MAX_DIAGNOSTICS) this.#diagnostics.splice(0, this.#diagnostics.length - MAX_DIAGNOSTICS); }
  #assertAlive() { if (this.#disposed) throw new Error("GraphRuntime is disposed."); }
}
export class MotionRuntime extends GraphRuntime {}
export function createGraphRuntime(motion, options = {}) { const graph = normalizeObservationGraph(motion); if (!graph.valid) throw new Error(`Cannot create runtime from invalid graph: ${graph.errors.map((error) => error.message).join("; ")}`); return new GraphRuntime({ graph, ...options }); }
