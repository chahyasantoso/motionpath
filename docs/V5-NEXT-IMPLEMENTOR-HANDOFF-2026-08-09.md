# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 14:33 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c74601f`, 129 files and 712 tests green  
**Current slice:** `61980f3`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity and the full Node 24 matrix are green through the controlled
Engine path. GraphBinding now captures the legacy Track edge projection once at
construction and passes explicit owner edges into ObservationStateBridge. The
bridge no longer needs to decide how to hydrate GraphBinding, and all later reads
remain state-only.

## Completed in this slice

- GraphBinding explicit owner-edge capture at construction, preserving mapFns.
- ObservationStateBridge state-only parity and owner-backed observer IDs.
- Track reverse observer index removal and source-destroy cleanup through owner
  state.
- Subscription disposal fixed: GraphBinding no longer duplicates the bridge's
  source-destroy subscription.

## Remaining jobs

1. Run the full matrix and strict boundary scan on `61980f3`; check readability
   first because Track/GraphBinding are protected files and dense rewrites are
   not acceptable.
2. Finish the P2-03 projection cut: move Track's remaining observation mutation
   and reader methods behind an external owner facade, preserving direct
   standalone behavior and GraphBinding rollback semantics.
3. Remove the remaining Track observation symbols and make strict P2-03 boundary
   green. Keep topology/playback findings for P2-04.

## Guardrails

Keep compatibility as the default. Do not weaken parity literals. Do not flip
`publisherRendering`, `crossMotion`, or `freeTracks` defaults. If modes disagree,
assume compatibility is wrong until proven otherwise.

## Verification

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```
