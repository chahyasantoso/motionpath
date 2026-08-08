/**
 * Project-scoped ownership and staged visibility boundary.
 *
 * A candidate is invisible until commitCandidate succeeds. This is deliberately
 * a small lifecycle owner for PR-18: graph construction remains in the existing
 * motion runtime until the project-level graph can replace it without changing
 * behavior. Candidates never share the active maps, so a failed reload cannot
 * partially overwrite the live project.
 */
export class ProjectRuntime {
  #active = null;
  #candidate = null;
  #instances = new Map();
  #instanceMetadata = new Map();
  #disposed = false;

  get isDisposed() { return this.#disposed; }
  get isCommitted() { return this.#active !== null; }
  get project() { return this.#active?.project ?? null; }
  get projectId() { return this.#active?.project?.projectId ?? null; }
  get candidateProject() { return this.#candidate?.project ?? null; }
  get instanceCount() { return this.#instances.size; }
  get instances() { return new Map(this.#instances); }

  beginCandidate(project) {
    this.#assertAlive();
    if (!project || typeof project !== "object") throw new TypeError("ProjectRuntime candidate must be an object.");
    if (this.#candidate) throw new Error("ProjectRuntime already has a candidate project.");
    const candidate = { project, instances: new Map(), metadata: new Map() };
    this.#candidate = candidate;
    return candidate;
  }

  registerCandidate(candidate, id, value, metadata = {}) {
    this.#assertCandidate(candidate);
    if (typeof id !== "string" || id.length === 0) throw new TypeError("ProjectRuntime candidate id must be a non-empty string.");
    if (candidate.instances.has(id)) throw new Error(`ProjectRuntime candidate already owns '${id}'.`);
    candidate.instances.set(id, value);
    candidate.metadata.set(id, { ...metadata });
    return value;
  }

  commitCandidate(candidate) {
    this.#assertCandidate(candidate);
    // Swap project visibility first. Mounted instances belong to the old
    // project until the caller destroys them after this method returns. Drop
    // only our references here so registering the replacement cannot collide.
    const previous = this.#active;
    this.#active = {
      project: candidate.project,
      instances: new Map(candidate.instances),
      metadata: new Map(candidate.metadata),
    };
    this.#candidate = null;
    this.#instances.clear();
    this.#instanceMetadata.clear();
    return previous?.project ?? null;
  }

  abortCandidate(candidate, { destroy = true } = {}) {
    if (!candidate || this.#candidate !== candidate) return false;
    this.#candidate = null;
    if (destroy) for (const value of candidate.instances.values()) value?.destroy?.();
    candidate.instances.clear();
    candidate.metadata.clear();
    return true;
  }

  registerInstance(id, value, metadata = {}) {
    this.#assertAlive();
    if (!this.#active) throw new Error("ProjectRuntime has no committed project.");
    if (typeof id !== "string" || id.length === 0) throw new TypeError("ProjectRuntime instance id must be a non-empty string.");
    if (this.#instances.has(id)) throw new Error(`ProjectRuntime already owns instance '${id}'.`);
    this.#instances.set(id, value);
    this.#instanceMetadata.set(id, { ...metadata });
    return value;
  }

  unregisterInstance(id, { destroy = true } = {}) {
    if (!this.#instances.has(id)) return false;
    const value = this.#instances.get(id);
    this.#instances.delete(id);
    this.#instanceMetadata.delete(id);
    if (destroy) value?.destroy?.();
    return true;
  }

  lookupInstance(id) { return this.#instances.get(id) ?? null; }
  getInstanceMetadata(id) { const metadata = this.#instanceMetadata.get(id); return metadata ? { ...metadata } : null; }
  getProjectLookup(id) { return this.#active?.project?.getQualifiedTrackConfig?.(id) ?? this.#active?.project?.getTrackConfig?.(id) ?? null; }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.abortCandidate(this.#candidate);
    for (const value of this.#instances.values()) value?.destroy?.();
    this.#instances.clear();
    this.#instanceMetadata.clear();
    this.#active = null;
  }

  #assertCandidate(candidate) {
    this.#assertAlive();
    if (!candidate || this.#candidate !== candidate) throw new Error("ProjectRuntime candidate is not active.");
  }
  #assertAlive() { if (this.#disposed) throw new Error("ProjectRuntime is disposed."); }
}
