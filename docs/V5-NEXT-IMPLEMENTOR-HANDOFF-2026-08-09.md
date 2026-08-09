# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 13:05 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest code head:** `99e37de` (CI re-run pending)  
**Last fully green head:** `48b6799`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is draft and red as of `51ec544`. The expanded parity runner caught a
real defect in **compatibility** ownership, not in the scoped adapter: the
`unregisterObserver` scenario failed the locked contract in compatibility mode and
the two modes disagreed. Fixed at `8456f8c`, regression-locked at `99e37de`. The
Node 24 matrix has not been re-run, so treat green as unproven until it is.

Production defaults are unchanged. Compatibility ownership is still the default
and nothing constructs Tracks against the scoped adapter.

## Completed

- PR #142 repair baseline frozen and preserved.
- Scoped private owner harness with explicit lifecycle boundary.
- Public Track-ID context and `COMPOSING` fallback preserved.
- Full parity through one scenario runner across both ownership modes, checked
  twice: mode against mode, and both against locked literals.
- `ProjectRuntime` disposal parity and public adapter surface parity.
- Compatibility refcount fix: `globalRefs` counts holders, not `register()`
  calls, so the last holder's `unregister` actually tears down the owner entry.
- Compatibility lifecycle watching latched on `#watched`, matching scoped.
- Default-off `ProjectRuntime({ observationOwnership: "scoped" })` selector.
- Status/report/handoff docs kept current.

## Next implementor job

1. Run the complete Node 24 matrix on `99e37de` and confirm all eight checks.
2. If green, parity is proven. Build the controlled runtime integration path:
   scoped ownership reachable only through the explicit `observationOwnership`
   option, with the compatibility fallback intact.
3. Only after that path is exercised end to end should the default move.

## Known hazard the fix deliberately left alone

When two adapters hold the same Track and one of them unregisters it, that
adapter's `#unregister` still drops only the track's **outgoing** edges through
`removeSourceEdges`. The incoming half survives because the refcount is still
above zero. That is the same shape as the bug just fixed, one level up, and it is
reachable only through the module globals, which is the thing scoped ownership
deletes. Do not paper over it in the compatibility adapter: prove it cannot
happen in the scoped path and remove the globals instead.

## Do not do yet

Do not change the default ownership mode. Do not remove the compatibility/global
fallback. Do not wire scoped ownership into Track construction. Do not flip
`publisherRendering`, `crossMotion`, or `freeTracks` defaults. Do not relax a
`LOCKED` parity entry to make a run green.

## Verification commands

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

## Safe baseline

If the next slice regresses, reset to PR #142 / commit `184f194`, not to a
speculative adapter rewrite.
