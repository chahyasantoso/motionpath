# MotionPath v5 status

**Status captured:** 2026-08-09 16:49 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Phase-two status:** green, owner-first GraphBinding migration complete  
**Next phase:** cycle-authority cleanup  
**Implementor review:** [`V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Next handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

Phase two is green across the full Node 24 matrix, including strict boundary,
unit tests, build, typecheck, packaging, benchmark, and baseline jobs. Authored
GraphBinding mutations now use ObservationState/controller state directly. P2-03
remains open only for the next architectural closures: duplicate cycle authority,
legacy facade removal, direct singleton fallback retirement, and final teardown/
performance evidence.

## Evidence-backed architecture

- Engine-created standalone Tracks share the injected ProjectRuntime adapter.
- Direct callers have an explicit caller-owned observation scope.
- Scoped ownership isolates duplicate IDs and preserves compose-context memoization.
- ObservationState owns authored graph state after hydration and rollback.
- GraphBinding uses the injected controller for authored mutations.
- Strict boundary and benchmark jobs are blocking CI checks.
- Compatibility remains default; scoped ownership is explicit opt-in.

## Closure checklist

- [x] Behavioral matrix and full Node 24 suite green.
- [x] Strict boundary command is a blocking PR job.
- [x] Benchmark and baseline jobs are blocking.
- [x] Public ownership docs corrected.
- [x] Caller-owned direct scope and isolation coverage added.
- [x] Authored GraphBinding uses owner/controller state directly.
- [ ] Remove GraphPublisher's duplicate Track-walking cycle guard.
- [ ] Remove the Track-installed legacy facade after caller migration.
- [ ] Retire the default singleton fallback from direct construction.
- [ ] Add deterministic hot-path benchmark threshold and repeated teardown evidence.
- [ ] Refresh status, matrix, review, and implementation report on final closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership`
default-off/default-compatibility. Keep P2-04 topology/playback removal separate.
Never weaken assertions or hide boundary findings with scanner exceptions.
