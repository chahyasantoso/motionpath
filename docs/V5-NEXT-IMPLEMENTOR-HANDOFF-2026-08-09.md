# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:23 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest verified head:** `48b6799`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143 is green on the latest non-documentation commit. All eight Node 24 checks passed: unit tests, typecheck, build, package dry run, format, boundary scan, and both informational benchmark jobs. The PR remains draft by design. Production defaults remain compatibility ownership.

## Completed

- PR #142 repair baseline frozen and preserved.
- Scoped private owner harness with explicit lifecycle boundary.
- Public Track-ID context and `COMPOSING` fallback preserved.
- Duplicate-ID isolation, disposal, lightweight-track, replacement, observer-ID, cycle, and memoization coverage.
- Direct compatibility-vs-scoped output-fold parity coverage.
- Default-off `ProjectRuntime({ observationOwnership: "scoped" })` selector.
- Status/report/handoff docs kept current.

## Next implementor job

Expand parity from the current output-fold comparison to input folds, repeated mapper replacement, mutual cycles, diamond memoization, lightweight tracks, destroy snapshots, duplicate IDs, and ProjectRuntime disposal using the same scenario runner for both adapters. Then run the complete Node 24 matrix. Only after parity is complete should scoped ownership be enabled in a controlled runtime integration path.

## Do not do yet

Do not change the default ownership mode. Do not remove the compatibility/global fallback. Do not wire scoped ownership into Track construction. Do not flip `publisherRendering`, `crossMotion`, or `freeTracks` defaults.

## Verification commands

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

## Safe baseline

If the next slice regresses, reset to PR #142 / commit `184f194`, not to a speculative adapter rewrite.
