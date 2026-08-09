# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 16:49 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Phase:** P2-03 phase three, cycle-authority cleanup

## Green evidence

The phase-two owner-first GraphBinding migration is green: unit tests, build,
typecheck, packaging, default boundary, strict boundary, benchmark, and baseline
checks all pass. Authored mutations now use the injected ObservationState controller;
legacy hooks remain only for explicit compatibility and fault-injection coverage.

## Phase three objective

Remove the duplicate GraphPublisher cycle authority. `ObservationState` and graph
normalization remain the intended authorities; GraphPublisher must stop walking
Track observation edges and must stop installing `_setGraphGuard` on Tracks.

## Required implementation order

1. Migrate the disposal cycle test from Track-installed guard behavior to the
   GraphBinding/ObservationState owner contract.
2. Delete GraphPublisher's `#graphGuard`, guard attachment, and guard detachment.
3. Keep cycle rejection before mutation in ObservationState and normalized graph
   validation. Preserve standalone mutual-cycle composition, which is not authored
   graph validation.
4. Add a regression proving rejected authored cycles leave state, IR, publisher
   order, and live composition unchanged.
5. Run the full Node 24 matrix, including strict boundary, before touching the
   compatibility facade.

## Still open after phase three

- Remove the Track-installed legacy facade after all direct callers/tests migrate.
- Route direct `Track` and `createTrack` construction through explicit scopes by
  default and retire the singleton fallback.
- Add repeated teardown and deterministic hot-path benchmark evidence.
- Refresh status, matrix, and implementation report on the final closure head.

## Guardrails

Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership`
default-off/default-compatibility. Keep P2-04 topology/playback removal separate.
Never weaken parity assertions or hide boundary findings with scanner exceptions.
