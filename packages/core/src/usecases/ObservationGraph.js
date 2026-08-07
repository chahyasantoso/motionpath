/**
 * Immutable, renderer-neutral observation graph value object.
 *
 * Track instances and plugin functions never cross this boundary. The existing
 * normalizer remains the parser and validator; this object is the only shape
 * consumers need after normalization.
 */
export class ObservationGraph {
  #nodes; #edges; #order; #errors;
  constructor({ nodes = [], edges = [], order = [], errors = [] } = {}) {
    this.#nodes = Object.freeze(nodes.map((node) => Object.freeze({ ...node })));
    this.#edges = Object.freeze(edges.map((edge) => Object.freeze({ ...edge })));
    this.#order = Object.freeze([...order]);
    this.#errors = Object.freeze(errors.map((error) => Object.freeze({ ...error })));
    Object.freeze(this);
  }
  get nodes() { return this.#nodes; }
  get edges() { return this.#edges; }
  get order() { return this.#order; }
  get errors() { return this.#errors; }
  get valid() { return this.#errors.length === 0; }
  get nodeIds() { return this.#nodes.map(({ id }) => id); }
  edgeKeys() { return this.#edges.map(({ source, target, role = "output", input }) => `${source}->${target}:${role}:${input ?? ""}`); }
  hasNode(id) { return this.#nodes.some((node) => node.id === id); }
  downstreamOf(source) { const targets = new Set(this.#edges.filter((edge) => edge.source === source).map((edge) => edge.target)); return this.#order.filter((id) => targets.has(id)); }
  toJSON() { return { valid: this.valid, nodes: this.#nodes, edges: this.#edges, order: this.#order, errors: this.#errors }; }
}
