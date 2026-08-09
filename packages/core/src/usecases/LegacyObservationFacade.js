const guards = new WeakMap();
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
export function hasMutationOverride(track, name) {
  return originals.get(track)?.[name] !== track?.[name];
}

/** Transitional v4 facade. The Track class no longer declares graph APIs. */
export function installLegacyObservationFacade(track) {
  if (!track || track[SET]) return track;
  const methods = {
    [SET](source, mapFn, options = {}) {
      const guard = guards.get(track);
      if (source) guard?.(track, source, options);
      if (!source) { track.getObservationOwner()?.clearObserved(track); track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" }); return; }
      const role = options.role ?? "output";
      const input = role === "input" ? options.target : undefined;
      const previous = track.getObservationOwner()?.getEdges(track).find((edge) => edge.source === source && edge.role === role && edge.input === input);
      track.getObservationOwner()?.setObserved(track, source, mapFn, options);
      track._emitObservationLifecycle?.({ type: previous ? "edge-replaced" : "edge-added", track, source, edge: { source: source.id, target: track.id, role, input } });
      track._emitObservationLifecycle?.({ type: "invalidated", track, reason: "observation" });
    },
    [REMOVE](source, options = {}) { return track.getObservationOwner()?.removeObserved(track, source, options); },
    [REPLACE](oldSource, newSource, mapFn, options = {}) { return track.getObservationOwner()?.replaceObserved(track, oldSource, newSource, mapFn, options); },
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
    _setGraphGuard: { configurable: true, writable: true, value(guard) { guards.set(track, guard ?? null); } },
  });
  return track;
}
