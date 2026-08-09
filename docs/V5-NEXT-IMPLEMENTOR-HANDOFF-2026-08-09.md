# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 18:10 Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Phase:** P2-03 facade-removal migration

## CI repair

The previous three commits had zero checks because `.github/workflows/ci.yml` only ran push validation on protected branches and the API-authored updates did not reliably enqueue pull_request checks. Feature/fix/test push triggers are restored. Verify the next push creates nine Node 24 jobs before making more architectural changes.

## Current implementation

- `Track` no longer installs `LegacyObservationFacade` in its constructor.
- `createTrack` and compatibility fixtures install the facade explicitly.
- Legacy mutation now adopts the source and observer into one explicit standalone adapter.
- GraphPublisher is scheduling-only; authored cycle authority is GraphBinding/ObservationState.
- Track remains responsible for topology/playback until separate P2-04 work.

## Known red areas

The last reported matrix still had failures in direct Track compatibility tests, standalone lifecycle/adoption tests, stale publisher cycle-guard expectations, and readability checks. Treat these as migration gaps to fix, not as reasons to restore Track-owned graph state or a process-global registry.

## Required next order

1. Confirm the push-triggered nine-job matrix appears on the current head.
2. Run the focused Track/adapter suites and fix explicit-adapter adoption, standalone mutual-cycle composition, duplicate-ID isolation, and destroy cleanup.
3. Migrate all remaining direct Track tests from implicit methods to explicit adapter/controller calls, preserving compatibility coverage only where explicitly intended.
4. Update stale tests that expect `GraphPublisher` to install `_setGraphGuard`; authored cycle rejection must go through GraphBinding/ObservationState.
5. Run the full matrix, including strict boundary, before closing P2-03.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership` default-off/default-compatibility. Keep P2-04 topology/playback removal separate. Never weaken assertions or scanner limits.
