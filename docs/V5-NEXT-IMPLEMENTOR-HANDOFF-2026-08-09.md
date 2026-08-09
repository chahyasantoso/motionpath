# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:58 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green with characterization-only changes. The proven adapter implementation remains unchanged. The next safe code slice adds an isolated scoped ownership seam, not a runtime behavior switch.

## Completed in this slice

- Output/input composition ordering.
- Public Track-ID context keys.
- Mutual-observation `COMPOSING` fallback.
- Diamond shared-source memoization.
- Repeated-edge mapper replacement.
- Duplicate public IDs inside one scope.
- Lightweight tracks without `.compose()`.
- ProjectRuntime adapter lifetime and disposal.
- `createObservationOwner` seam with explicit lifecycle and owner isolation tests.

## Required next sequence

1. Prove the scoped owner through an adapter-compatible integration harness, preserving the exact compose protocol.
2. Add a feature-flagged ProjectRuntime path that can select the scoped owner without changing the default.
3. Run full Node 24 CI, compare protocol results, then expand the flag coverage.
4. Remove the global fallback only after default and scoped paths are behaviorally equivalent.

## Guardrails

Keep PR #142 frozen and green. Do not merge PR #143 until the scoped-owner integration path is separately green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
