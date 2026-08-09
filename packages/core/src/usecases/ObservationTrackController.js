import { trackComposeLeaf } from "./composeContext.js";

/**
 * Track-facing observation facade.
 *
 * This is deliberately smaller than Track and owns no lifecycle state of its
 * own. GraphBinding supplies one per authored graph, backed by ObservationState;
 * standalone adapters can expose the same contract directly. The next removal
 * step can therefore delete Track's compatibility projection without changing
 * GraphBinding's transaction vocabulary.
 */
export class ObservationTrackController {
  #state;
  #tracks;

  constructor({ state, tracks = new Map() } = {}) {
    if (!state) throw new TypeError("ObservationTrackController requires observation state.");
    this.#state = state;
    this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
  }

  getEdges(target) {
    return this.#state.getEdges(this.#id(target));
  }

  getSources(target) {
    return this.#state.getSources(this.#id(target))
      .map((id) => this.#tracks.get(id))
      .filter(Boolean);
  }

  getObserverIds(source) {
    return this.#state.getObserverIds(this.#id(source));
  }

  setObserved(observer, source, mapFn, { role = "output", target } = {}) {
    return this.#state.addEdge({
      source: this.#id(source),
      target: this.#id(observer),
      role,
      input: role === "input" ? (target ?? observer.id) : undefined,
      mapFn: mapFn ?? null,
    });
  }

  removeObserved(observer, source, { role, target } = {}) {
    this.#state.removeEdge({
      source: this.#id(source),
      target: this.#id(observer),
      role,
      input: target,
    });
  }

  replaceObserved(observer, oldSource, newSource, mapFn, opts = {}) {
    return this.#state.replaceEdge(
      { source: this.#id(oldSource), target: this.#id(observer), role: opts.role },
      {
        source: this.#id(newSource),
        target: this.#id(observer),
        role: opts.role,
        input: opts.target,
        mapFn,
      },
    );
  }

  clearObserved(observer) {
    for (const edge of this.getEdges(observer)) {
      this.removeObserved(observer, edge.source, { role: edge.role, target: edge.input });
    }
  }

  compose(track, rawData, ctx) {
    return this.#state.compose(this.#id(track), rawData, ctx, trackComposeLeaf);
  }

  #id(track) {
    return typeof track === "object" ? track.id : track;
  }
}
