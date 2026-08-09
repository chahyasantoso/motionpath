# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:13 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

The opt-in scoped adapter harness is green on its dedicated tests. Production Track and ProjectRuntime behavior remain unchanged.

## Completed in this slice

- Scoped private owner lifetime.
- Public Track-ID context and `COMPOSING` fallback.
- Duplicate-ID isolation and lifecycle tests.
- Parity coverage for output/input ordering, mapper replacement, observer IDs, removal, mutual cycles, and shared-source memoization.

## Required next sequence

1. Run the full Node 24 matrix on the parity expansion.
2. Add a default-off ProjectRuntime selector for the scoped adapter.
3. Compare default and scoped paths through the full suite.
4. Remove the global fallback only after equivalent behavior is proven.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
