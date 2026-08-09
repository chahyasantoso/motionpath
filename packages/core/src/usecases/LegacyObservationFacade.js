const guards = new WeakMap();
const SET = "setObserved";
const REMOVE = "removeObserved";
const REPLACE = "replaceObserved";
const SOURCES = "observedSources";
const EDGES = "observedEdges";
const COUNT = "observerCount";
const IDS = "observerIds";

/** Transitional v4 facade. The Track class no longer declares graph APIs. */
export function installLegacyObservationFacade(track) {
  if (!track || track[SET]) return track;
  Object.defineProperties(track, {
    [SET]: {
      configurable: true,
      writable: true,
      value(source, mapFn, options = {}) {
        const guard = guards.get(track);
        if (source) guard?.(track, source, options);
        if (!source) return track.getObservationOwner()?.clearObserved(track);
        return track.getObservationOwner()?.setObserved(track, source, mapFn, options);
      },
    },
    [REMOVE]: {
      configurable: true,
      writable: true,
      value(source, options = {}) {
        return track.getObservationOwner()?.removeObserved(track, source, options);
      },
    },
    [REPLACE]: {
      configurable: true,
      writable: true,
      value(oldSource, newSource, mapFn, options = {}) {
        const guard = guards.get(track);
        guard?.(track, newSource, options);
        return track.getObservationOwner()?.replaceObserved(
          track,
          oldSource,
          newSource,
          mapFn,
          options,
        );
      },
    },
    [SOURCES]: {
      configurable: true,
      get() { return track.getObservationOwner()?.getSources(track) ?? []; },
    },
    [EDGES]: {
      configurable: true,
      get() {
        return (track.getObservationOwner()?.getEdges(track) ?? [])
          .map((edge) => ({ ...edge, target: track.id }));
      },
    },
    [COUNT]: {
      configurable: true,
      get() { return track[IDS].length; },
    },
    [IDS]: {
      configurable: true,
      get() { return track.getObservationOwner()?.getObserverIds(track) ?? []; },
    },
    _setGraphGuard: {
      configurable: true,
      writable: true,
      value(guard) { guards.set(track, guard ?? null); },
    },
  });
  return track;
}
