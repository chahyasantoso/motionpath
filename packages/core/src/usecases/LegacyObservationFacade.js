const SET = "setObserved";
const REMOVE = "removeObserved";
const SOURCES = "observedSources";

/**
 * Transitional facade for v4 callers. The Track class no longer owns or declares
 * observation APIs; this adapter is installed only for legacy direct callers while
 * GraphBinding and ObservationState migrate to the owner-first surface.
 */
export function installLegacyObservationFacade(track) {
  if (!track || track[SET]) return track;
  Object.defineProperties(track, {
    [SET]: { value(source, mapFn, options = {}) { if (!source) return track.getObservationOwner()?.clearObserved(track); return track.getObservationOwner()?.setObserved(track, source, mapFn, options); }, configurable: true },
    [REMOVE]: { value(source, options = {}) { return track.getObservationOwner()?.removeObserved(track, source, options); }, configurable: true },
    [SOURCES]: { get() { return track.getObservationOwner()?.getSources(track) ?? []; }, configurable: true },
  });
  return track;
}
