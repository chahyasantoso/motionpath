# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:15 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

The opt-in scoped adapter harness and expanded parity tests are green. ProjectRuntime now has a default-off `observationOwnership: 'scoped'` selector; compatibility ownership remains the default.

## Completed in this slice

- Scoped adapter harness with private owner lifetime.
- Parity coverage for folds, replacement, cycles, memoization, IDs, and lifecycle.
- ProjectRuntime selector with explicit `compatibility` default and opt-in `scoped` mode.
- Rejection of unknown ownership modes.

## Required verification

Run full Node 24 CI on the selector commit. Then exercise Engine-created standalone Tracks with `observationOwnership: 'scoped'` before considering any default change.

## Next work

Add an Engine integration test proving the selector reaches Track creation and preserves standalone composition. Compare compatibility and scoped modes on a real runtime graph. Keep compatibility default and the global fallback until that comparison is green.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
