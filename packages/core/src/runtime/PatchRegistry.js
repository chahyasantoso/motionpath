function stableValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function sameValue(a, b) { return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b)); }
function freezePatch(patch) { return Object.freeze({ ...patch, values: Object.freeze({ ...(patch.values ?? {}) }), sourceRevisions: Object.freeze({ ...(patch.sourceRevisions ?? {}) }) }); }

export class PatchRegistry {
  #patches = new Map();
  #subscribers = new Map();
  #revisions = new Map();
  #batchDepth = 0;
  #pending = new Set();

  beginBatch() { this.#batchDepth += 1; }
  endBatch() {
    if (this.#batchDepth === 0) throw new Error("PatchRegistry batch is not open.");
    this.#batchDepth -= 1;
    if (this.#batchDepth !== 0) return;
    const pending = [...this.#pending];
    this.#pending.clear();
    for (const nodeId of pending) this.#notify(nodeId);
  }
  publish(nodeId, values, { sourceProgress = 0, sourceRevisions = {}, status = "ready" } = {}) {
    if (typeof nodeId !== "string" || nodeId.length === 0) throw new TypeError("PatchRegistry nodeId must be a non-empty string.");
    if (!["ready", "blocked", "error"].includes(status)) throw new TypeError(`Unknown patch status '${status}'.`);
    const previous = this.#patches.get(nodeId);
    if (previous && sameValue(previous.values, values) && previous.sourceProgress === sourceProgress && sameValue(previous.sourceRevisions, sourceRevisions) && previous.status === status) return previous;
    const revision = (this.#revisions.get(nodeId) ?? 0) + 1;
    const patch = freezePatch({ nodeId, revision, values, sourceProgress, sourceRevisions, status });
    this.#revisions.set(nodeId, revision);
    this.#patches.set(nodeId, patch);
    if (this.#batchDepth) this.#pending.add(nodeId); else this.#notify(nodeId);
    return patch;
  }
  get(nodeId) { return this.#patches.get(nodeId) ?? null; }
  snapshot() { return new Map(this.#patches); }
  subscribe(nodeId, callback) {
    if (typeof callback !== "function") throw new TypeError("PatchRegistry subscriber must be a function.");
    const subscribers = this.#subscribers.get(nodeId) ?? new Set();
    subscribers.add(callback); this.#subscribers.set(nodeId, subscribers);
    return () => { subscribers.delete(callback); if (subscribers.size === 0) this.#subscribers.delete(nodeId); };
  }
  clear() { this.#patches.clear(); this.#subscribers.clear(); this.#revisions.clear(); this.#pending.clear(); this.#batchDepth = 0; }
  #notify(nodeId) { for (const callback of [...(this.#subscribers.get(nodeId) ?? []), ...(this.#subscribers.get("*") ?? [])]) callback(this.#patches.get(nodeId)); }
}
