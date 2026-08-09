# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 18:34 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**Head:** `ddcc3ffbc6c1d51d18755c90b56c880fe5c7d8e7`  
**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Review:** [`V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md)

## Current truth

Do not merge this head. Push and pull-request workflows both ran, producing 18 checks. Both unit-test jobs failed; the other 16 jobs passed. Treat the unit failure as a correctness blocker and the duplicate matrix as a gate-integrity defect.

The architecture has moved in the right direction, but P2-03 is not closed. Track-local edge maps and the publisher cycle guard are gone. ObservationState is the authored owner. Compatibility is still installed by `createTrack`, ownership can migrate implicitly, and old adapter state can survive behind GraphBinding.

## Required order

1. Reproduce and fix the Node 24 unit failures without weakening assertions.
2. Stop duplicate CI execution so one head has one authoritative matrix.
3. Make legacy facade installation opt-in. Engine-authored Tracks must not expose banned observation properties.
4. Reject cross-owner edge mutation. Never unregister and re-home a live Track implicitly.
5. Transfer or clear standalone state atomically when GraphBinding takes authority; add a bind, mutate, unbind resurrection test.
6. Restore edge-removal invalidation and `observerIds` on the destroyed lifecycle event.
7. Remove GraphBinding's compatibility-override plus controller double mutation.
8. Decide whether `compatibility` and `scoped` are genuinely different. Keep independent implementations for parity, or collapse the fake rollout.
9. Add declarations for `createObservationScope` and any supported injected runtime option.
10. Make source formatting a real CI gate, then run focused ownership, lifecycle, rollback, cycle, duplicate-ID, disposal, and runtime symbol-ban suites.
11. Run one full Node 24 matrix on the exact final head and refresh status docs only after it is green.

## Guardrails

Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off. Keep P2-04 topology/playback separate. Do not accept source-text absence as proof that the runtime Track surface is clean, and do not use alias-versus-alias tests as ownership parity evidence.
