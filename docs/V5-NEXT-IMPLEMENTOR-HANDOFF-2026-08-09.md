# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:03 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green before the opt-in scoped harness slice. The proven adapter implementation remains unchanged. The new harness is isolated, default-off, and not wired into Track or ProjectRuntime.

## Completed in this slice

- Added `ScopedObservationAdapter` with private owner lifetime.
- Preserved public IDs and `COMPOSING` fallback in the harness.
- Added duplicate-ID isolation, mutual-cycle, and lifecycle tests.

## Required verification

Run the full Node 24 matrix on the harness commit before integrating it:

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

## Next work

If green, compare the harness against the existing adapter with the characterization suite, then add a default-off ProjectRuntime selector. Do not remove the global fallback or change defaults until equivalence is proven.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
