import { observationGraphEdgeKey } from "./observationEdge.js";
import { toImmutableList } from "../contract/immutableValue.js";

/**
 * Immutable, renderer-neutral observation graph value object.
 *
 * Track instances and plugin functions never cross this boundary. The existing
 * normalizer remains the parser and validator; this object is the only shape
 * consumers need after normalization. Adjacency indexes are built once here,
 * so publishers and bindings do not rebuild reverse indexes from live Tracks.
 *
 * Nodes, edges, and diagnostics are frozen through the shared immutable-value
 * contract rather than a one-level spread, so a record that later grows a
 * nested field cannot silently become mutable again.
 */
export class ObservationGraph {
  #nodes;
  #edges;
  #order;
  #errors;
  #upstream;
  #downstream;
  #edgeIndex;
  constructor({ nodes = [], edges = [], order = [], errors = [] } = {}) {
    this.#nodes = toImmutableList(nodes);
    this.#edges = toImmutableList(edges);
    this.#order = Object.freeze([...order]);
    this.#errors = toImmutableList(errors);
    const upstream = new Map(this.#nodes.map(({ id }) => [id, []]));
    const downstream = new Map(this.#nodes.map(({ id }) => [id, []]));
    const edgeIndex = new Map();
    for (const edge of this.#edges) {
      upstream.get(edge.target)?.push(edge.source);
      downstream.get(edge.source)?.push(edge.target);
      edgeIndex.set(observationGraphEdgeKey(edge), edge);
    }
    this.#upstream = new Map(
      [...upstream].map(([id, values]) => [id, Object.freeze([...values])]),
    );
    this.#downstream = new Map(
      [...downstream].map(([id, values]) => [id, Object.freeze([...values])]),
    );
    this.#edgeIndex = edgeIndex;
    Object.freeze(this);
  }
  get nodes() {
    return this.#nodes;
  }
  get edges() {
    return this.#edges;
  }
  get order() {
    return this.#order;
  }
  get errors() {
    return this.#errors;
  }
  get valid() {
    return this.#errors.length === 0;
  }
  get nodeIds() {
    return this.#nodes.map(({ id }) => id);
  }
  edgeKeys() {
    return this.#edges.map((edge) => observationGraphEdgeKey(edge));
  }
  hasNode(id) {
    return this.#nodes.some((node) => node.id === id);
  }
  hasEdge(edge) {
    return this.#edgeIndex.has(observationGraphEdgeKey(edge));
  }
  upstreamOf(target) {
    return [...(this.#upstream.get(target) ?? [])];
  }
  downstreamOf(source) {
    const direct = new Set(this.#downstream.get(source) ?? []);
    return this.#order.filter((id) => direct.has(id));
  }
  toJSON() {
    return {
      valid: this.valid,
      nodes: this.#nodes,
      edges: this.#edges,
      order: this.#order,
      errors: this.#errors,
    };
  }
}
