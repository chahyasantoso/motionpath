import { observationEdgeKey } from "./observationEdge.js";
import { mergePatches } from "./mergePatches.js";
import { COMPOSING } from "./composeContext.js";

export class ObservationState {
  #edges = new Map(); #observers = new Map(); #tracks = new Map(); #onInvalidate; #validateCycles; #destroyed = false;
  /**
   * Reverse index for #keyForTrack.
   *
   * Finding F-09. Resolving a Track back to its key used to be a linear scan of
   * the whole registry, paid on every recursive compose hop and every cycle
   * check. The standalone owner's registry is process-wide, so that scan had no
   * upper bound. The cache is validated on read, so an unregistered key falls
   * back to the scan and first-registration still wins.
   */
  #idsByTrack = new WeakMap();
  constructor({ tracks = new Map(), onInvalidate = () => {}, validateCycles = true } = {}) { this.#onInvalidate = typeof onInvalidate === "function" ? onInvalidate : () => {}; this.#validateCycles = validateCycles !== false; for (const [id, track] of tracks instanceof Map ? tracks : new Map(tracks)) this.register(track, id); }
  get isDestroyed() { return this.#destroyed; } get tracks() { return new Map(this.#tracks); }
  register(track, id = track?.id) { this.#assertAlive(); if (!track?.id || !id) throw new TypeError("ObservationState.register requires a track with an id."); const existing = this.#tracks.get(id); if (existing && existing !== track) throw new Error(`Duplicate track id '${id}'.`); this.#tracks.set(id, track); if (!this.#edges.has(id)) this.#edges.set(id, new Map()); if (!this.#observers.has(id)) this.#observers.set(id, new Set()); if (!this.#idsByTrack.has(track)) this.#idsByTrack.set(track, id); return track; }
  unregister(id, { detach = true } = {}) { if (this.#destroyed || !this.#tracks.has(id)) return; const outgoing = [...(this.#edges.get(id)?.values() ?? [])]; for (const edge of outgoing) this.removeEdge({ source: edge.source.id, target: id, role: edge.role, input: edge.input }); this.removeSourceEdges(id); this.#tracks.delete(id); this.#edges.delete(id); this.#observers.delete(id); if (detach) this.#invalidate({ type: "track-removed", id }); }
  removeSourceEdges(sourceId) { if (this.#destroyed) return; for (const targetId of [...(this.#observers.get(sourceId) ?? [])]) { const targetEdges = this.#edges.get(targetId) ?? new Map(); for (const edge of [...targetEdges.values()]) if (edge.source.id === this.#tracks.get(sourceId)?.id || edge.source === this.#tracks.get(sourceId)) this.removeEdge({ source: sourceId, target: targetId, role: edge.role, input: edge.input }); } }
  /** Public reads clone. A caller must not be able to mutate a live bucket. */
  getEdges(targetId) { return this.#edgeList(targetId).map((edge) => ({ ...edge })); }
  /**
   * Internal reads do not clone. Finding F-09: compose walks these twice per
   * node per tick and the cycle check walks them once per visited node per
   * mutation, so per-edge object allocation here is per-frame garbage.
   */
  #edgeList(targetId) { return [...(this.#edges.get(targetId)?.values() ?? [])]; }
  /** O(1) key -> Track. Prefer this over the `tracks` getter, which clones. */
  getTrack(id) { return this.#tracks.get(id) ?? null; }
  getSources(targetId) { return [...new Set(this.#edgeList(targetId).map(({ source }) => source.id))]; } getObserverIds(sourceId) { return [...(this.#observers.get(sourceId) ?? [])]; }
  addEdge({ source, target, role = "output", input, mapFn = null }) { this.#assertAlive(); const observer = this.#tracks.get(target); const sourceTrack = this.#tracks.get(source); if (!observer || !sourceTrack) throw new Error("ObservationState edge references an unknown track."); if (observer === sourceTrack) throw new Error(`Track "${target}" cannot observe itself.`); const normalizedInput = role === "input" ? (input ?? target) : undefined; if (this.#validateCycles) this.#assertAcyclic(target, source); const key = observationEdgeKey(source, role, normalizedInput); const bucket = this.#edges.get(target) ?? new Map(); const previous = bucket.get(key); if (previous) this.#observers.get(source)?.delete(target); bucket.set(key, { source: sourceTrack, mapFn, role, input: normalizedInput, target }); this.#edges.set(target, bucket); const observers = this.#observers.get(source) ?? new Set(); observers.add(target); this.#observers.set(source, observers); this.#invalidate({ type: previous ? "edge-replaced" : "edge-added", edge: { source, target, role, input: normalizedInput } }); return this.getEdges(target).find((edge) => observationEdgeKey(edge.source.id, edge.role, edge.input) === key); }
  removeEdge({ source, target, role, input }) { if (this.#destroyed) return; const bucket = this.#edges.get(target); if (!bucket) return; const keys = [...bucket.entries()].filter(([, edge]) => edge.source === this.#tracks.get(source) && (role === undefined || edge.role === role) && (role !== "input" || input === undefined || edge.input === input)).map(([key]) => key); for (const key of keys) bucket.delete(key); if (keys.length && ![...bucket.values()].some((edge) => edge.source === this.#tracks.get(source))) this.#observers.get(source)?.delete(target); if (keys.length) this.#invalidate({ type: "edge-removed", edge: { source, target, role, input } }); }
  replaceEdge(oldEdge, newEdge) { this.#assertAlive(); const old = this.getEdges(oldEdge.target).find((edge) => edge.source === this.#tracks.get(oldEdge.source) && (oldEdge.role === undefined || edge.role === oldEdge.role)); if (!old) throw new Error(`Track "${oldEdge.target}" does not observe "${oldEdge.source}".`); const next = { source: newEdge.source, target: oldEdge.target, role: newEdge.role ?? old.role, input: newEdge.input ?? old.input, mapFn: newEdge.mapFn ?? old.mapFn }; if (this.#validateCycles) this.#assertAcyclic(next.target, next.source); const snapshot = { source: oldEdge.source, target: old.target, role: old.role, input: old.input, mapFn: old.mapFn }; this.removeEdge(snapshot); try { this.addEdge(next); } catch (error) { this.addEdge(snapshot); throw error; } }
  compose(targetId, rawData, ctx = new Map(), composeLeaf, composeSource) {
    this.#assertAlive();
    const track = this.#tracks.get(targetId);
    if (!track) throw new Error(`Unknown observation target '${targetId}'.`);
    if (typeof composeLeaf !== "function") throw new TypeError("ObservationState.compose requires composeLeaf.");
    const base = rawData ?? track.getSnapshot?.() ?? {};
    const cached = ctx.get(targetId);
    // COMPOSING means we re-entered the node we are already composing. A mutual
    // pair has to fall back to the local patch instead of recursing forever.
    if (cached === COMPOSING) return composeLeaf(track, base, ctx);
    if (cached !== undefined) return cached;
    ctx.set(targetId, COMPOSING);
    const composeObserved = (source) => composeSource
      ? composeSource(source, ctx)
      : this.compose(this.#keyForTrack(source), undefined, ctx, composeLeaf, composeSource);
    let source = base;
    // Input edges rewrite the raw state before the local plugins run. Output
    // edges merge into the composed patch after. One pass per role, in order.
    for (const edge of this.#edgeList(targetId)) {
      if (edge.role !== "input" || !edge.mapFn) continue;
      const contribution = edge.mapFn(composeObserved(edge.source));
      if (contribution) source = { ...source, ...contribution };
    }
    let patch = composeLeaf(track, source, ctx);
    for (const edge of this.#edgeList(targetId)) {
      if (edge.role !== "output" || !edge.mapFn) continue;
      const contribution = edge.mapFn(composeObserved(edge.source));
      if (contribution) patch = mergePatches(patch, contribution);
    }
    ctx.set(targetId, patch);
    return patch;
  }
  destroy() { if (!this.#destroyed) { this.#destroyed = true; this.#edges.clear(); this.#observers.clear(); this.#tracks.clear(); } }
  #keyForTrack(track) {
    const cached = this.#idsByTrack.get(track);
    if (cached !== undefined && this.#tracks.get(cached) === track) return cached;
    for (const [id, value] of this.#tracks) if (value === track) { this.#idsByTrack.set(track, id); return id; }
    return track.id;
  }
  #assertAcyclic(target, source) { const seen = new Set(), queue = [source]; while (queue.length) { const id = queue.shift(); if (id === target) throw new Error(`Observing "${source}" from "${target}" would create a cycle.`); if (seen.has(id)) continue; seen.add(id); for (const edge of this.#edgeList(id)) queue.push(this.#keyForTrack(edge.source)); } }
  #invalidate(event) { if (!this.#destroyed) this.#onInvalidate(event); }
  #assertAlive() { if (this.#destroyed) throw new Error("ObservationState is destroyed."); }
}
