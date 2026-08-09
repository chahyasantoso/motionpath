# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 13:59 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c8bc9a8`, full suite green  
**Current slice:** `dfdb177` + `f63c562`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity and the full Node 24 matrix are green through the controlled
Engine path. The state-authoritative graph slice is underway. GraphBinding now
checks normalized graph IR against ObservationState, not Track edge projections,
and strict boundary mode now blocks Track observation ownership symbols.

## Completed in this slice

- Added `ObservationStateBridge.assertGraphParity(graph)`, a state-only check.
- Switched `GraphBinding.#assertTrackGraphMatches()` to that check.
- Re-asserted graph parity after every committed mutation.
- Added rollback tests for rejected add/remove/replace/late-track mutations,
  including mapFn preservation in owner state.
- Kept `syncFromTracks()` as one-way construction hydration only.
- Strict boundary mode now blocks P2-03 Track ownership symbols; default mode
  reports them without failing while the migration remains in progress.
- Removed the process-wide adapter globals and centralized adapter construction
  through ProjectRuntime in the preceding slice.

## Next jobs

1. Verify this slice with the full matrix and strict boundary report.
2. Move GraphBinding initial hydration to explicit owner edges, then delete the
   remaining post-construction Track edge reads from `ObservationStateBridge`.
3. Replace Track's compatibility reverse index with adapter/state observer IDs,
   then remove `#observers`, `_addObserver`, `_removeObserver`, and the destroy
   snapshot dependency on Track-owned reverse state.
4. Remove the remaining Track observation symbols, then make strict boundary
   green. Keep topology findings non-blocking until P2-04.

## Guardrails

Keep compatibility as the default. Do not weaken parity literals. Do not flip
`publisherRendering`, `crossMotion`, or `freeTracks` defaults. If modes disagree,
assume the compatibility path is wrong until the state and lifecycle contract
proves otherwise.

## Verification

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```
