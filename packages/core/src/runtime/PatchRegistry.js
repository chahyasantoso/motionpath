function freezePatch(patch) {
  return Object.freeze({
    ...patch,
    values: Object.freeze({ ...(patch.values ?? {}) }),
    sourceRevisions: Object.freeze({ ...(patch.sourceRevisions ?? {}) }),
  });
}

export class PatchRegistry {
  #patches = new Map();
  #subscribers = new Map();
  #revisions = new Map();

  publish(nodeId, values, { sourceProgress = 0, sourceRevisions = {}, status = "ready" } = {}) {
    if (typeof nodeId !== "string" || nodeId.length === 0) throw new TypeError("PatchRegistry nodeId must be a non-empty string.");
    if (!["ready", "blocked", "error"].includes(status)) throw new TypeError(`Unknown patch status '${status}'.`);
    const revision = (this.#revisions.get(nodeId) ?? 0) + 1;
    const patch = freezePatch({ nodeId, revision, values, sourceProgress, sourceRevisions, status });
    this.#revisions.set(nodeId, revision);
    this.#patches.set(nodeId, patch);
    for (const callback of [...(this.#subscribers.get(nodeId) ?? []), ...(this.#subscribers.get("*") ?? [])]) callback(patch);
    return patch;
  }

  get(nodeId) { return this.#patches.get(nodeId) ?? null; }
  snapshot() { return new Map(this.#patches); }
  subscribe(nodeId, callback) {
    if (typeof callback !== "function") throw new TypeError("PatchRegistry subscriber must be a function.");
    const subscribers = this.#subscribers.get(nodeId) ?? new Set();
    subscribers.add(callback);
    this.#subscribers.set(nodeId, subscribers);
    return () => { subscribers.delete(callback); if (subscribers.size === 0) this.#subscribers.delete(nodeId); };
  }
  clear() { this.#patches.clear(); this.#subscribers.clear(); this.#revisions.clear(); }
}
