# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:02 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green with characterization-only changes. The proven adapter implementation remains unchanged; the protocol lock now includes destroy observer snapshots.

## Completed in this slice

- Output/input composition ordering.
- Public Track-ID context keys.
- Mutual-observation `COMPOSING` fallback.
- Diamond shared-source memoization.
- Repeated-edge mapper replacement.
- Duplicate public IDs inside one scope.
- Lightweight tracks without `.compose()`.
- ProjectRuntime adapter lifetime and disposal.
- Observer ID snapshot stability before source cleanup.
- `createObservationOwner` lifecycle seam.

## Required next sequence

1. Build an adapter-compatible scoped-owner harness that preserves these exact contracts.
2. Add a feature-flagged ProjectRuntime path selecting the harness, default-off.
3. Compare default and scoped paths through the full Node 24 suite.
4. Remove the global fallback only after behavioral equivalence is proven.

## Guardrails

Keep PR #142 frozen and green. Do not merge PR #143 until the scoped-owner implementation is separately green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
