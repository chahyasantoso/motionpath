# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 14:03 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c8bc9a8`, full suite green  
**Current slice:** `1310614` + `4e13839`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity and the full Node 24 matrix are green through the controlled
Engine path. The bridge cut has started: `ObservationStateBridge` hydrates from
Track projections only during construction. Its parity and integrity checks now
read owner state, not Track readers, so post-construction Track drift cannot
rewrite or invalidate the owner graph.

## Completed in this slice

- Added state-only `ObservationStateBridge.assertParity()`.
- Kept construction-only legacy hydration private.
- Added `assertGraphParity(graph)` as the GraphBinding IR contract.
- Updated bridge tests to lock one-way hydration and state authority.
- GraphBinding validates normalized graph IR against ObservationState and rechecks
  after commits.
- Strict boundary mode blocks P2-03 Track ownership symbols.

## Next jobs

1. Verify this cut with the full matrix and strict boundary report.
2. Make GraphBinding initial wiring pass explicit owner edges wherever mapFns are
   available, then remove its remaining post-construction Track edge reads.
3. Replace Track's reverse observer index with adapter/state observer IDs. Delete
   `#observers`, `_addObserver`, `_removeObserver`, and the destroy snapshot's
   dependency on Track-owned reverse state. The authored GraphBinding lifecycle
   callback must remove source state before Track cleanup.
4. Remove the remaining Track observation symbols and make strict boundary green.

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
