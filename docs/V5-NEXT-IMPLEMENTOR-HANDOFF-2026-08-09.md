# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:56 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green with characterization-only changes. The proven adapter implementation remains unchanged; this branch is now the contract lock for the scoped-owner redesign.

## Completed in this slice

- Output and input composition ordering.
- Public Track-ID context keys.
- Mutual-observation `COMPOSING` fallback.
- Diamond shared-source memoization.
- Repeated-edge mapper replacement.
- Duplicate public IDs within one ownership scope.
- Lightweight tracks without `.compose()`.
- ProjectRuntime adapter lifetime and disposal, covered by existing runtime tests.

## Required next sequence

1. Add/confirm Track-level destroy observer snapshots against the scoped-owner seam.
2. Extract a scoped ownership interface behind the unchanged adapter API.
3. Migrate ProjectRuntime injection in one small commit, preserving the global fallback.
4. Run full Node 24 CI after each slice. Keep the global compatibility fallback until the scoped path is proven equivalent.

## Guardrails

Keep PR #142 frozen and green. Do not merge PR #143 until the scoped-owner implementation is separately green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
