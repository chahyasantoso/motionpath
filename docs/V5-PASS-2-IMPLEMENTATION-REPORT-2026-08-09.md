# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**Head:** `6158ffd` before the CI/docs repair commit  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)

## Delivered in this slice

- GraphPublisher no longer owns a duplicate Track-walking cycle guard.
- Track construction no longer installs the legacy observation facade automatically.
- createTrack and compatibility fixtures install the facade explicitly.
- Legacy mutations adopt both endpoints into one explicit adapter.
- Standalone adapter composition preserves owner-scoped identity and memoization boundaries.
- Readability protection was restored for Track and GraphPublisher.
- CI trigger coverage is being repaired because the last three commits had zero checks.

## Current evidence

The non-unit jobs had passed on the prior head, but the facade-removal matrix is not currently green. The latest red evidence is concentrated in direct Track compatibility tests, stale cycle-guard expectations, and standalone owner adoption/composition. The next run on the trigger-repaired head is the source of truth.

## Next work

1. Confirm nine push-triggered Node 24 jobs on the new head.
2. Fix focused Track/adapter lifecycle and composition failures.
3. Migrate stale tests from Track-installed publisher guards to GraphBinding/ObservationState.
4. Refresh this report and the completion matrix only after the full matrix is green.

## Guardrails

Do not restore Track-owned edge maps, process-global observation state, or publisher cycle guards. Preserve public IDs, mapper/input semantics, lifecycle ordering, and all default-off rollout flags.
