/**
 * Collects dirty graph nodes and publishes composed patches once per flush.
 * The publisher is framework-agnostic: callers decide how patches reach DOM,
 * canvas, or another renderer.
 */
export class GraphPublisher {
  #order;
  #tracks;
  #dirty = new Set();
  #publish;

  constructor({ order = [], tracks = new Map(), publish } = {}) {
    if (typeof publish !== "function") throw new TypeError("GraphPublisher requires a publish callback.");
    this.#order = [...order];
    this.#tracks = tracks;
    this.#publish = publish;
  }

  markDirty(trackId) { if (this.#tracks.has(trackId)) this.#dirty.add(trackId); }
  markAllDirty() { for (const id of this.#order) if (this.#tracks.has(id)) this.#dirty.add(id); }

  flush() {
    if (this.#dirty.size === 0) return 0;
    const dirty = this.#dirty;
    this.#dirty = new Set();
    const composed = new Map();
    let published = 0;
    for (const id of this.#order) {
      const track = this.#tracks.get(id);
      if (!track) continue;
      const patch = track.compose(undefined, composed);
      composed.set(id, patch);
      if (dirty.has(id)) { this.#publish(id, patch); published += 1; }
    }
    return published;
  }
}
