# MotionPath v5 status

**Status captured:** 2026-08-09 18:10 Jakarta  
**Branch:** `feat/pass2-track-facade-removal` at `6158ffd`  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Phase:** P2-03 facade-removal migration, CI trigger repair

## Executive status

The last three implementation commits had zero checks because CI only listened for protected-branch pushes and the API-authored updates did not enqueue a pull_request run. The workflow now also validates `feat/**`, `fix/**`, and `test/**` pushes, so the next branch update will produce the full Node 24 matrix.

The facade-removal batch is not green yet. The current known failures are compatibility callers still assuming Track-installed methods, standalone compose ownership across independently created Tracks, stale publisher cycle-guard expectations, and readability drift. No failure is being hidden or marked complete.

## Evidence-backed architecture

- Engine-created standalone Tracks share the injected ProjectRuntime adapter.
- Direct legacy callers are migrated through explicit adapter adoption.
- Authored graph state and cycle validation belong to GraphBinding/ObservationState.
- GraphPublisher no longer installs or walks a Track cycle guard.
- Compatibility remains explicit and rollout flags remain default-off.

## Closure checklist

- [x] GraphPublisher Track-walking cycle guard removed.
- [x] Strict boundary and benchmark jobs are blocking in CI.
- [x] Track construction no longer installs the legacy facade automatically.
- [x] createTrack and compatibility fixtures install the facade explicitly.
- [x] Direct legacy mutations adopt both endpoints into one explicit adapter.
- [ ] Full Node 24 matrix green on the final facade-removal head.
- [ ] Migrate remaining direct Track tests and stale cycle-guard expectations.
- [ ] Retire the default singleton fallback from direct construction.
- [ ] Add deterministic hot-path benchmark threshold and repeated teardown evidence.
- [ ] Refresh status, matrix, review, and implementation report on the final green head.

## Next implementor

Start from [V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md), then run the push-triggered Node 24 unit job first. Do not change P2-04 topology/playback or rollout defaults.
