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
    [SET]: { value(source, mapFn, options = {}) { if (!source) return track.getObservationOwner()?.clearObserved(track); return track.getObservationOwner()?.setObserved(track, source, mapFn, options); }, configurable: true },
    [REMOVE]: { value(source, options = {}) { return track.getObservationOwner()?.removeObserved(track, source, options); }, configurable: true },
    [REPLACE]: { value(oldSource, newSource, mapFn, options = {}) { return track.getObservationOwner()?.replaceObserved(track, oldSource, newSource, mapFn, options); }, configurable: true },
    [SOURCES]: { get() { return track.getObservationOwner()?.getSources(track) ?? []; }, configurable: true },
    [EDGES]: { get() { return (track.getObservationOwner()?.getEdges(track) ?? []).map((edge) => ({ ...edge, target: track.id })); }, configurable: true },
    [COUNT]: { get() { return track[IDS].length; }, configurable: true },
    [IDS]: { get() { return track.getObservationOwner()?.getObserverIds(track) ?? []; }, configurable: true },
  });
  return track;
}
