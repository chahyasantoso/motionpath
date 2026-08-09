# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:44 Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #142 is the frozen repair baseline. The scoped-adapter migration is isolated on this branch and must not be merged as part of the repair PR without its own green evidence.

## Completed in this migration slice

- Removed module-global standalone ownership.
- Scoped `TrackObservationOwner` to each `StandaloneObservationAdapter`.
- Preserved public Track-ID compose contexts and `COMPOSING` cycle fallback.
- Added dedicated tests for duplicate IDs, cross-adapter mutual observation, and disposal isolation.

## Required verification

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

## Next work

If this branch is green, review and merge it separately. Then begin F-01 ownership inversion: make ObservationState receive graph writes first, migrate GraphBinding, ObservationStateBridge, and GraphPublisher reads, and only afterward remove Track's duplicate observation maps.
