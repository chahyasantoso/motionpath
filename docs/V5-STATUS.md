# MotionPath v5 status

**Status captured:** 2026-08-07 21:59 Asia/Jakarta  
**Branch reviewed:** `v5-pr-16-publisher-only-runtime`  
**Base branch:** `v5`  
**Base SHA:** `e24231c7af29cdee69968a085fa728de9fa90de9`  
**Active PR:** #96, publisher-only same-motion React subscription.

## Current position

- PR #91 merged green: Checkpoint C passed.
- PR #92 merged green: GSAP adapter boundary landed.
- PR #93 merged green: recursive Motion scheduling landed.
- PR #94 merged green: explicit authored-graph input validation landed.
- PR #95 merged green: immutable ObservationGraph landed.
- Active PR #96 targets PR-16: publisher-only patch subscription for same-motion rendering, while legacy rendering remains the default.
- If CI is green, merge PR #96 and continue with PR-17 project membership and qualified IDs. If red, use supplied logs and fix the active branch.

## Open review findings

- #2 production GraphRuntime integration, addressed incrementally by PR #96 but not fully closed until staged visibility is complete.
- #4 public exports, deferred to PR-20.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending PR #96 and publisher-only integration evidence
- E not passed
- F not passed
