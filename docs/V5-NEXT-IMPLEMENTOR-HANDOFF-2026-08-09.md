# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:11 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

The opt-in `ScopedObservationAdapter` harness is green on its dedicated tests. Production Track and ProjectRuntime behavior remain unchanged. The harness now has focused parity coverage for output-fold values and public edge shape.

## Completed in this slice

- Scoped private owner lifetime.
- Public Track-ID context and `COMPOSING` fallback.
- Duplicate-ID isolation and lifecycle tests.
- Adapter parity test for output folds and edge shape.

## Required next sequence

1. Expand parity coverage to input folds, repeated mapper replacement, mutual cycles, diamond memoization, lightweight tracks, and destroy snapshots.
2. Add a default-off ProjectRuntime selector for the scoped adapter.
3. Run full Node 24 CI and compare both paths.
4. Remove the global fallback only after equivalent behavior is proven.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
