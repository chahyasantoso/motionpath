import { trackComposeLeaf } from "./composeContext.js";

/** State-backed Track-facing observation facade. */
export class ObservationTrackController {
  #state;
  #tracks;
  constructor({ state, tracks = new Map() } = {}) {
    if (!state) throw new TypeError("ObservationTrackController requires observation state.");
    this.#state = state;
    this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
  }
  getEdges(target) { return this.#state.getEdges(this.#id(target)); }
  getSources(target) { return this.#state.getSources(this.#id(target)).map((id) => this.#tracks.get(id)).filter(Boolean); }
  getObserverIds(source) { return this.#state.getObserverIds(this.#id(source)); }
  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    this.#register(observer); this.#register(source);
    return this.#state.addEdge({ source: this.#id(source), target: this.#id(observer), role, input: role === "input" ? (target ?? observer.id) : undefined, mapFn: mapFn ?? null });
  }
  removeObserved(observer, source, { role, target } = {}) { this.#state.removeEdge({ source: this.#id(source), target: this.#id(observer), role, input: target }); }
  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    this.#register(observer); this.#register(newSource);
    const oldId = this.#id(oldSource); const targetId = this.#id(observer);
    const oldEdges = this.#state.getEdges(targetId).filter((edge) => edge.source === oldId && (opts.role === undefined || edge.role === opts.role));
    if (!oldEdges.length) return this.#state.getEdges(targetId).find((edge) => edge.source === this.#id(newSource) && (opts.role === undefined || edge.role === opts.role));
    return this.#state.replaceEdge({ source: oldId, target: targetId, role: opts.role }, { source: this.#id(newSource), target: targetId, role: opts.role, input: opts.target, mapFn });
  }
  clearObserved(observer) { for (const edge of this.getEdges(observer)) this.removeObserved(observer, edge.source, { role: edge.role, target: edge.input }); }
  removeSourceEdges(source) { this.#state.removeSourceEdges(this.#id(source)); }
  compose(track, rawData, ctx) { return this.#state.compose(this.#id(track), rawData, ctx, trackComposeLeaf); }
  #register(track) { const id = this.#id(track); if (!this.#tracks.has(id)) this.#tracks.set(id, track); this.#state.register(track, id); }
  #id(track) { return typeof track === "object" ? track.id : track; }
}
