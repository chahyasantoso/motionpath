# MotionPath v5 status

**Status captured:** 2026-08-10 06:41 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Session state:** Phase 0 complete, Phase 1 ready to start

## Executive status

Phase 0 is complete. The hard-break plan is now five vertical phases, the self-blocking readability gates are removed, and the branch is ready for the ownership cut. PR #145 remains evidence only, not merge approval: its semantic diff is reviewable, but its history is noisy and its unit gate is not an acceptable release baseline.

## Phase 0 evidence

- Removed `scripts/v5-readability-allowlist.mjs`.
- Removed `packages/core/src/code-style.test.js`.
- Removed `packages/core/src/readability-boundary.test.js`.
- Kept repository-wide Prettier as the mechanical formatting gate.
- Kept architecture and GSAP boundary scans.
- Corrected the plan to distinguish semantic diff size from formatting churn.
- Recorded the next implementor path in the handoff and completion matrix.

These gates were deleted because they protected files scheduled for deletion and had already generated repeated formatting/comment-restoration churn. This is not a relaxation of behavior checks: runtime symbol absence, lifecycle, rollback, ownership, and full unit tests remain required.

## Current blockers before Phase 1 sign-off

- `createTrack.js` still installs `LegacyObservationFacade` unconditionally.
- `StandaloneObservationAdapter` is an alias of `ScopedObservationAdapter`; ownership modes are not independent.
- `GraphBinding` still rebuilds `ObservationState` through `ObservationStateBridge` after commits.
- Engine still creates graph runtime/publisher ownership per Motion instead of at ProjectRuntime level.
- Publisher composition still delegates through `Track.compose()`.
- Lifecycle and stale-owner bind/unbind regressions still need executable coverage.

## Next implementor action: Phase 1

Remove compatibility and duplicate ownership together. Delete the legacy facade and owner modes, keep one project-scoped `ObservationState`, eliminate bridge rebuilds, make `GraphBinding` the sole mutation coordinator, and migrate tests in the same commits.

Do not touch cross-motion, free-track, publisher rollout, or P2-04 topology/playback work yet.

## Verification policy

No phase is complete from a stale head, partial run, or docs-only claim. Every phase must finish with one exact-head matrix covering unit/integration tests, typecheck, build, package, Prettier, boundary scans, lifecycle/rollback, and relevant benchmarks.

The plan and handoff must be updated in the same phase-closing commit with the exact head, evidence, remaining risks, and the next executable action.
