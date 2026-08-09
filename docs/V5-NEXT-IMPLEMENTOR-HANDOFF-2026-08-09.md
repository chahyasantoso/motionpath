# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 16:37 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Phase:** P2-03 phase one, owner-first caller migration

## Current truth

The P2-03 behavior matrix is green. Phase one now provides an explicit caller-owned
scope for direct Track construction, lets `createTrack` accept `observationScope`
or `projectRuntime`, and adds owner-first Track coverage without changing legacy
compatibility behavior yet.

## Phase one delivered

- `createTrack` accepts a caller-owned observation scope or ProjectRuntime;
- direct Track owner-first mutation/read/composition coverage is locked;
- duplicate-ID scope isolation remains covered;
- strict boundary and benchmark jobs remain blocking CI checks.

## Next phase one work

Migrate existing direct Track tests and any production callers from facade names to
`getObservationOwner()` or injected controller APIs. Do not remove the facade until
that migration is complete and the compatibility contract has its own isolated tests.

## Closure gates after caller migration

1. Remove Track-installed legacy observation properties and methods.
2. Remove GraphPublisher's Track-walking cycle guard and `_setGraphGuard`.
3. Remove authored GraphBinding compatibility dual-write.
4. Add repeated teardown evidence and a deterministic hot-path benchmark threshold.
5. Refresh status, matrix, and implementation report on the final closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership` default-off/default-compatibility. Keep P2-04 topology/playback removal separate. Never hide a boundary finding with a scanner exception.
