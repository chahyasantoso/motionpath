# MotionPath v5 next implementor handoff

**Captured:** 2026-08-10 06:44 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**PR context:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Current phase:** Phase 1 in progress, one graph authority
**Plan:** [`V5-HARD-BREAK-IMPLEMENTATION-PLAN.md`](./V5-HARD-BREAK-IMPLEMENTATION-PLAN.md)

## Handoff truth

The first Phase 1 cut is `c57f862`. `createTrack()` now returns a plain Track, Track lifecycle payload construction lives in `observationEvents.js`, and GraphBinding late-track wiring uses only its state controller. This is a partial cut, not a phase sign-off.

## Resume from here

1. Remove the remaining compatibility facade module and compatibility-only imports/tests.
2. Collapse ownership to one project-scoped implementation; remove the mode option and alias.
3. Remove `_adoptObservationOwner` and reject cross-owner mutation before state changes.
4. Replace ObservationStateBridge with one long-lived ObservationState and an undo journal.
5. Strip topology mutation from GraphPublisher and keep GraphBinding as the only coordinator.
6. Add runtime surface, cross-owner, stale-owner, lifecycle, and rollback tests.
7. Run the exact-head matrix, then update all four handoff docs to close Phase 1.

## Do not drift

Do not touch qualified cross-motion identity, free-track enablement, publisher rollout, or P2-04 topology/playback removal until Phase 1 is green. Do not weaken assertions, reintroduce Track-owned observation state, or create a replacement compatibility facade.

## Phase close protocol

At the end of every phase, update all four together: implementation plan, `V5-STATUS.md`, `V5-PASS-2-COMPLETION-MATRIX.md`, and this handoff. Include exact head, evidence, remaining risks, and the next executable action so the next implementor can resume without chat context.
