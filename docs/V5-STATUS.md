# MotionPath v5 status

**Status captured:** 2026-08-09 16:15 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Reviewed behavior head:** `32ada3e`, all eight original Node 24 checks green  
**Latest closure head:** follow-up commits after the implementor review  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Implementor review:** [`V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Next handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

The P2-03 behavior slice is green and reviewed. Adapter parity, scoped runtime
integration, GraphBinding rollback, source cleanup, readability, build, typecheck,
packaging, boundary reporting, and the cache fuzz suite pass. P2-03 is not yet
architecturally closed because the legacy facade, direct-construction fallback,
second cycle authority, authored dual-write path, and strict CI evidence were
still being closed in the follow-up.

## Evidence-backed architecture

- Engine-created standalone Tracks share the injected ProjectRuntime adapter.
- Scoped ownership isolates duplicate IDs and preserves compose-context memoization.
- ObservationState owns authored graph state after construction hydration.
- GraphBinding injects the state-backed controller and preserves rollback metadata.
- Track has no local edge or reverse-observer maps.
- Compatibility remains the default; scoped ownership is explicit opt-in.
- Strict boundary enforcement and non-optional benchmark jobs are now wired into CI.

## Closure checklist

- [x] Behavioral matrix and full Node 24 suite green at reviewed behavior head.
- [x] Strict boundary command added as a blocking PR job.
- [x] Benchmark and baseline jobs no longer continue on error.
- [x] Public ownership docs corrected.
- [ ] Remove Track-installed legacy facade after production caller migration.
- [ ] Remove direct singleton fallback or explicitly close it with isolation evidence.
- [ ] Make ObservationState/controller the sole runtime cycle authority.
- [ ] Remove authored GraphBinding dual-write.
- [ ] Add hot-path benchmark threshold and repeated teardown evidence.
- [ ] Refresh this file again on the final closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership`
default-off/default-compatibility. Keep P2-04 topology/playback removal separate.
Never weaken assertions or hide boundary findings with scanner exceptions.
