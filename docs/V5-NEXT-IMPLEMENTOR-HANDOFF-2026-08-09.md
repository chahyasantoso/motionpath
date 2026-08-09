# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 16:15 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Reviewed head:** `32ada3e`, all eight original Node 24 checks green  
**Current closure work:** strict boundary enforcement and ownership cleanup are in progress

## Current truth

The P2-03 behavior matrix is green, including adapter parity, runtime integration,
GraphBinding rollback, source cleanup, readability, build, typecheck, packaging,
and the cache fuzz suite. The refactor is not complete until the compatibility
facade, cycle authority, direct-construction fallback, and authored dual-write
seams are removed or explicitly closed.

## Closure work landed in this slice

- strict boundary scan is now a blocking PR job;
- benchmark and baseline jobs are no longer `continue-on-error`;
- compatibility ownership documentation no longer claims a process-global registry;
- the implementor review is recorded in `V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md`.

## Remaining closure gates

1. Remove Track-installed legacy observation properties and methods after migrating all production callers to owner/controller APIs.
2. Make direct standalone construction use an explicit caller-owned compatibility scope, or retain the fallback only with an isolation test and documented exception.
3. Remove GraphPublisher's Track-walking cycle guard and `_setGraphGuard`; ObservationState/controller becomes the sole runtime authority.
4. Remove authored GraphBinding compatibility dual-write; state mutation and owner-generated lifecycle events become the only authored path.
5. Add repeated teardown and owner-isolation regression tests, plus a small benchmark threshold for the cache hot path.
6. Refresh status, matrix, and implementation report on the exact green closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership` default-off/default-compatibility. Keep P2-04 topology/playback removal separate. Never hide a boundary finding with a scanner exception.
