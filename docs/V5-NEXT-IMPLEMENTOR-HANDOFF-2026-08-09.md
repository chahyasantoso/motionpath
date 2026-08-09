# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 13:55 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `f39f63c`, full suite green  
**Current slice:** `ed38b5c` + `447f08a`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity and the full Node 24 matrix are green through the controlled
Engine path. The next slice has started: ObservationState now exposes graph-level
parity, and GraphBinding validates its normalized graph against owner state rather
than deriving its live edge count from Track projections.

## Completed in this slice

- Added `ObservationStateBridge.assertGraphParity(graph)`, a state-only check.
- Switched `GraphBinding.#assertTrackGraphMatches()` to that check.
- Re-asserted graph parity after every committed mutation.
- Kept `syncFromTracks()` as a one-way construction seam for legacy direct Track
  callers; it is no longer the authority for post-construction mutations.
- Removed the process-wide adapter globals and centralized adapter construction
  through ProjectRuntime, as landed in the preceding slice.

## Next jobs

1. Add explicit state-authoritative rollback tests: mapFn preservation, rejected
   publisher commits, source removal, addTrack rollback, and repeated refreshes.
2. Move GraphBinding's initial hydration to explicit owner edges, then delete the
   remaining post-construction Track edge reads from `ObservationStateBridge`.
3. Replace Track's compatibility reverse index with adapter/state observer IDs,
   then remove `#observers`, `_addObserver`, `_removeObserver`, and the destroy
   snapshot dependency on Track-owned reverse state.
4. Widen the boundary scan and run the full matrix after each ownership cut.

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
```
