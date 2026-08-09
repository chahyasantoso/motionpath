import { TrackObservationOwner } from "./TrackObservationOwner.js";

/**
 * Creates an observation owner with caller-defined lifetime.
 *
 * This is intentionally a seam, not a default switch. The existing standalone
 * adapter remains the compatibility implementation until a scoped owner proves
 * the exact composition protocol in a separate integration change.
 */
export function createObservationOwner({
  composeSource,
  tracks = new Map(),
} = {}) {
  return new TrackObservationOwner({
    tracks,
    validateCycles: false,
    composeSource,
  });
}
