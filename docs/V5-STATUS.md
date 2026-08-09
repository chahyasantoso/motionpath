# MotionPath v5 status

**Status captured:** 2026-08-09 16:33 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest closure work:** caller-owned direct observation scope factory  
**Implementor review:** [`V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Next handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

The P2-03 behavior slice remains green. The latest closure work adds an explicit
caller-owned `createObservationScope()` for direct users and locks duplicate-ID
isolation across independent scopes. P2-03 is still not architecturally closed:
the Track facade, singleton fallback migration, cycle authority, and authored
GraphBinding dual-write still need final removal or explicit deprecation evidence.

## Evidence-backed architecture

- Engine-created standalone Tracks share the injected ProjectRuntime adapter.
- Direct consumers can now create and dispose an isolated observation scope.
- Scoped ownership isolates duplicate IDs and preserves compose-context memoization.
- ObservationState owns authored graph state after construction hydration.
- Strict boundary enforcement and benchmark jobs are blocking CI checks.
- Compatibility remains the default; scoped ownership is explicit opt-in.

## Closure checklist

- [x] Behavioral matrix and full Node 24 suite green at reviewed behavior head.
- [x] Strict boundary command is a blocking PR job.
- [x] Benchmark and baseline jobs are blocking.
- [x] Public ownership docs corrected.
- [x] Caller-owned direct scope factory and duplicate-ID isolation test added.
- [ ] Remove Track-installed legacy facade after production caller migration.
- [ ] Route direct Track/createTrack construction through explicit scopes by default.
- [ ] Make ObservationState/controller the sole runtime cycle authority.
- [ ] Remove authored GraphBinding dual-write.
- [ ] Add hot-path benchmark threshold and repeated teardown evidence.
- [ ] Refresh this file again on the final closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership`
default-off/default-compatibility. Keep P2-04 topology/playback removal separate.
Never weaken assertions or hide boundary findings with scanner exceptions.
