# MotionPath v5 status

**Status captured:** 2026-08-10 06:44 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Session state:** Phase 1 in progress, first authority cut landed

## Executive status

Phase 0 is complete. Phase 1 has started with the first production cut: Track construction no longer installs the legacy facade, lifecycle event construction is neutralized, and GraphBinding no longer branches through legacy mutation overrides. Phase 1 is **not complete** until duplicate ownership and bridge rebuilds are removed and the exact-head matrix is green.

## Phase 1 evidence so far

- `c57f862`: removed unconditional `installLegacyObservationFacade()` from `createTrack()`.
- Added `usecases/observationEvents.js` and removed Track's import dependency on the compatibility facade.
- Removed `hasMutationOverride()` from GraphBinding late-track wiring.
- Preserved lifecycle observer IDs and current topology behavior for the later P2-04 cut.

## Remaining Phase 1 blockers

- Delete the legacy facade and its remaining compatibility-only tests/imports.
- Collapse `observationOwnership` to one implementation and remove the alias rollout.
- Remove implicit owner adoption and reject cross-owner mutation.
- Keep one long-lived ObservationState; eliminate ObservationStateBridge recreation.
- Remove GraphPublisher topology mutation methods.
- Add runtime symbol-ban, cross-owner, bind/mutate/unbind, lifecycle, and rollback regressions.
- Run one exact-head unit, typecheck, build, package, format, boundary, and benchmark matrix.

## Next executable action

Finish the ownership cut in Phase 1. Do not start qualified cross-motion identity, free-track enablement, publisher rollout, or P2-04 topology/playback removal.

## Verification policy

No phase is complete from a stale head, partial run, or docs-only claim. The plan, status, completion matrix, and handoff must be updated together when Phase 1 closes with exact head, evidence, remaining risks, and the next executable action.
