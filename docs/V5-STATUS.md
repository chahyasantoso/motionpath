# MotionPath v5 status

**Status captured:** 2026-08-10 07:21 Asia/Jakarta  
**Branch:** `v5-break` from clean `v5` at `e4fc9b9`  
**Draft PR:** [#146](https://github.com/chahyasantoso/motionpath/pull/146)  
**Historical PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145), frozen evidence only  
**Session state:** Phase 1 in progress

## Executive status

Phase 0 is closed with an exact-head green matrix. Phase 1 has started on the correct clean branch and the first authority cut is landed. The branch now returns plain Tracks from `createTrack`, constructs lifecycle payloads outside the compatibility facade, and routes GraphBinding late-track wiring through its controller only.

## Phase 1 cut landed

- `321ce97`: removed factory-level facade installation.
- Added neutral `usecases/observationEvents.js` and removed Track's direct lifecycle-helper dependency on the legacy facade.
- Removed GraphBinding's legacy mutation-override branch.
- Preserved existing topology behavior until the planned P2-04 phase.

## Phase 1 remaining work

- Remove the remaining compatibility facade and ownership-mode machinery.
- Reject implicit cross-owner mutation.
- Replace bridge recreation with one long-lived ObservationState and an undo journal.
- Remove GraphPublisher topology mutation methods.
- Activate and pass the Phase 1 contract suites, including lifecycle, rollback, stale-owner, and runtime-surface checks.

## Next executable action

Continue the single authority cut. Do not begin qualified cross-motion identity, free-track enablement, publisher rollout, or P2-04 topology/playback removal.

## Verification policy

The Phase 1 contract command remains intentionally separate until its owning behavior lands. Phase 1 closes only with the contract suites, full exact-head matrix, and all four phase docs refreshed together.
