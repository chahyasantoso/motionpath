const guards = new WeakMap();
const SET = "setObserved";
const REMOVE = "removeObserved";
const REPLACE = "replaceObserved";
const SOURCES = "observedSources";
const EDGES = "observedEdges";
const COUNT = "observerCount";
const IDS = "observerIds";

/** Builds the legacy destroy event without coupling Track to the observer field name. */
export function createDestroyEvent(id, ids) {
  return { id, observerIds: ids };
}

/** Transitional v4 facade. The Track class no longer declares graph APIs. */
export function installLegacyObservationFacade(track) {
  if (!track || track[SET]) return track;
  Object.defineProperties(track, {
    [SET]: { configurable: true, writable: true, value(source, mapFn, options = {}) {
      const guard = guards.get(track);
      if (source) guard?.(track, source, options);
      if (!source) { track.getObservationOwner()?.clearObserved(track); track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" }); return; }
      const role = options.role ?? "output";
      const input = role === "input" ? options.target : undefined;
      const previous = track.getObservationOwner()?.getEdges(track).find((edge) => edge.source === source && edge.role === role && edge.input === input);
      track.getObservationOwner()?.setObserved(track, source, mapFn, options);
      track._emitObservationLifecycle?.({ type: previous ? "edge-replaced" : "edge-added", track, source, edge: { source: source.id, target: track.id, role, input } });
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    } },
    [REMOVE]: { configurable: true, writable: true, value(source, options = {}) {
      const edges = track.getObservationOwner()?.getEdges(track).filter((edge) => edge.source === source);
      track.getObservationOwner()?.removeObserved(track, source, options);
      for (const edge of edges ?? []) track._emitObservationLifecycle?.({ type: "edge-removed", track, source, edge: { source: source.id, target: track.id, role: edge.role, input: edge.input } });
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    } },
    [REPLACE]: { configurable: true, writable: true, value(oldSource, newSource, mapFn, options = {}) {
      const guard = guards.get(track);
      guard?.(track, newSource, options);
      const owner = track.getObservationOwner();
      const oldEdges = owner?.getEdges(track).filter((edge) => edge.source === oldSource);
      const role = options.role ?? oldEdges?.[0]?.role;
      const input = role === "input" ? (options.target ?? oldEdges?.[0]?.input) : undefined;
      owner?.replaceObserved(track, oldSource, newSource, mapFn, { ...options, role, target: input });
      for (const edge of oldEdges ?? []) {
        track._emitObservationLifecycle?.({ type: "edge-removed", track, source: oldSource, edge: { source: oldSource.id, target: track.id, role: edge.role, input: edge.input } });
        track._emitObservationLifecycle?.({ type: "edge-added", track, source: newSource, edge: { source: newSource.id, target: track.id, role, input } });
      }
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    } },
    [SOURCES]: { configurable: true, get() { return track.getObservationOwner()?.getSources(track) ?? []; } },
    [EDGES]: { configurable: true, get() { return (track.getObservationOwner()?.getEdges(track) ?? []).map((edge) => ({ ...edge, target: track.id })); } },
    [COUNT]: { configurable: true, get() { return track[IDS].length; } },
    [IDS]: { configurable: true, get() { return track.getObservationOwner()?.getObserverIds(track) ?? []; } },
    _setGraphGuard: { configurable: true, writable: true, value(guard) { guards.set(track, guard ?? null); } },
  });
  return track;
}
