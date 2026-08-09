const originals = new WeakMap();
const SET = "setObserved";
const REMOVE = "removeObserved";
const REPLACE = "replaceObserved";
const SOURCES = "observedSources";
const EDGES = "observedEdges";
const COUNT = "observerCount";
const IDS = "observerIds";

/** Builds the legacy destroy event without coupling Track to the observer field name. */
export function createDestroyEvent(id, ids) { return { id, observerIds: ids }; }

/** Returns true only when a caller explicitly replaces a legacy mutation hook. */
export function hasMutationOverride(track, name) { return originals.get(track)?.[name] !== track?.[name]; }

/** Transitional v4 facade installed only by explicit compatibility boundaries. */
export function installLegacyObservationFacade(track) {
  if (!track || track[SET]) return track;
  const methods = {
    [SET](source, mapFn, options = {}) {
      if (!source) { track.getObservationOwner()?.clearObserved(track); track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" }); return; }
      const owner = track.getObservationOwner?.();
      // Authored Tracks expose an ObservationTrackController, not an adapter.
      // Never pass that controller into Track owner adoption: it has no register
      // lifecycle and doing so produced the observed owner.register failure.
      if (typeof owner?.register === "function") {
        source._adoptObservationOwner?.(owner);
        track._adoptObservationOwner?.(owner);
      }
      const role = options.role ?? "output";
      const input = role === "input" ? options.target : undefined;
      const previous = owner?.getEdges(track).find((edge) => edge.source === source && edge.role === role && edge.input === input);
      owner?.setObserved(track, source, mapFn, options);
      track._emitObservationLifecycle?.({ type: previous ? "edge-replaced" : "edge-added", track, source, edge: { source: source.id, target: track.id, role, input } });
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    },
    [REMOVE](source, options = {}) { return track.getObservationOwner()?.removeObserved(track, source, options); },
    [REPLACE](oldSource, newSource, mapFn, options = {}) {
      const owner = track.getObservationOwner?.();
      if (typeof owner?.register === "function") {
        oldSource?._adoptObservationOwner?.(owner);
        newSource?._adoptObservationOwner?.(owner);
      }
      const oldEdges = owner?.getEdges(track).filter((edge) => edge.source === oldSource && (options.role === undefined || edge.role === options.role)) ?? [];
      const role = options.role ?? oldEdges[0]?.role ?? "output";
      const input = role === "input" ? (options.target ?? oldEdges[0]?.input) : undefined;
      owner?.replaceObserved(track, oldSource, newSource, mapFn, { ...options, role, target: input });
      for (const edge of oldEdges) {
        track._emitObservationLifecycle?.({ type: "edge-removed", track, source: oldSource, edge: { source: oldSource.id, target: track.id, role: edge.role, input: edge.input } });
        track._emitObservationLifecycle?.({ type: "edge-added", track, source: newSource, edge: { source: newSource.id, target: track.id, role, input });
      }
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    },
  };
  originals.set(track, methods);
  Object.defineProperties(track, {
    [SET]: { configurable: true, writable: true, value: methods[SET] },
    [REMOVE]: { configurable: true, writable: true, value: methods[REMOVE] },
    [REPLACE]: { configurable: true, writable: true, value: methods[REPLACE] },
    [SOURCES]: { configurable: true, get() { return track.getObservationOwner()?.getSources(track) ?? []; } },
    [EDGES]: { configurable: true, get() { return (track.getObservationOwner()?.getEdges(track) ?? []).map((edge) => ({ ...edge, target: track.id })); } },
    [COUNT]: { configurable: true, get() { return track[IDS].length; } },
    [IDS]: { configurable: true, get() { return track.getObservationOwner()?.getObserverIds(track) ?? []; } },
  });
  return track;
}
