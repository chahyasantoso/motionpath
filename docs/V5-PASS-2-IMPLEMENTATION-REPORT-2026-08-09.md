# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Scope:** failure-log analysis, PR #142 repair baseline, and scoped-adapter migration review

## Current decision

PR #142 remains the frozen green repair baseline. The first PR #143 scoped-adapter implementation was reverted after its Node 24 run expanded to 33 failures. The current PR #143 branch is green with characterization-only changes; the proven adapter implementation remains unchanged.

## What is retained

- Explicit-null handling in `createTrack`.
- GraphBinding rollback that restores ObservationState and Track wiring, including `mapFn`.
- O(1) lookup improvements on the hot observation path.
- Readability and destroy re-entrancy fixes.

## Characterization now locked

The dedicated protocol suite covers output folds, input-before-local ordering, public Track-ID context keys, mutual-cycle fallback, diamond memoization, repeated-edge mapper replacement, duplicate public IDs inside one scope, and lightweight tracks without `.compose()`. Existing ProjectRuntime tests cover adapter lifetime and disposal.

These tests are intentionally a contract lock. They prevent the next ownership implementation from quietly changing composition semantics while moving state between registries.

## Correct next design

1. Add the remaining Track-level destroy observer snapshot characterization.
2. Extract a scoped ownership interface behind the unchanged adapter API.
3. Switch one ProjectRuntime path at a time, preserving the global fallback until equivalence is proven.
4. Run full Node 24 CI after every slice.

Do not merge PR #143 as a scoped migration yet. Do not flip publisher rendering, cross-motion, or free-track defaults.
