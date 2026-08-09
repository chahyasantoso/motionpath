# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:19 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green through the scoped harness and default-off ProjectRuntime selector. The latest Node 24 run passed all eight checks. Production defaults remain compatibility ownership.

## Completed in this slice

- Scoped private owner lifetime and lifecycle boundary.
- Public Track-ID context and `COMPOSING` fallback.
- Duplicate-ID isolation and disposal tests.
- Parity coverage for output/input ordering, mapper replacement, observer IDs/removal, mutual cycles, shared-source memoization, and compatibility output-fold equivalence.
- Default-off `ProjectRuntime({ observationOwnership: "scoped" })` selector with compatibility mode unchanged.

## Required next sequence

1. Expand adapter parity to the remaining lifecycle and cross-adapter cases.
2. Run the full Node 24 matrix after each parity addition.
3. Only after complete parity, wire scoped ownership into a controlled runtime integration path.
4. Remove the compatibility fallback last.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
