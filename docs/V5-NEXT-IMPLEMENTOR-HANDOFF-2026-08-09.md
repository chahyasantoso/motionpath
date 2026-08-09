# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:51 Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

The 33-failure scoped-adapter rewrite is rolled back. This branch now adds characterization tests only; the green adapter implementation remains unchanged. PR #142 remains the safe repair baseline.

## Completed in this slice

- Characterized output and input composition ordering.
- Characterized public Track-ID context keys.
- Characterized mutual observation cycle fallback.
- Characterized diamond shared-source memoization.

## Required next sequence

1. Add characterization tests for mapFn replacement, destroy snapshots, duplicate IDs, lightweight tracks, and ProjectRuntime disposal.
2. Extract a scoped ownership interface behind the unchanged adapter API.
3. Migrate ProjectRuntime injection in one small commit.
4. Run full Node 24 CI after each slice. Keep the global compatibility fallback until the scoped path is proven equivalent.

## Guardrails

Keep PR #142 frozen and green. Do not merge PR #143 yet. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
