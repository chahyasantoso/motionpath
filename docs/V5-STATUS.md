# MotionPath v5 status

**Status captured:** 2026-08-08 06:30 Asia/Jakarta  
**Branch reviewed:** `v5-pr-17-qualified-ids`  
**Base branch:** `v5`  
**Base SHA:** `e92e1f03c20c13af6d26954fdf523e84ee187343`  
**Active PR:** #97, project-local qualified IDs and membership lookup.

## Current position

- PR #91 merged green: Checkpoint C passed.
- PR #92 merged green: GSAP adapter boundary landed.
- PR #93 merged green: recursive Motion scheduling landed.
- PR #94 merged green: explicit authored-graph input validation landed.
- PR #95 merged green: immutable ObservationGraph landed.
- PR #96 merged green: opt-in publisher-backed React subscription path landed.
- Active PR #97 targets PR-17: qualified `motionId/trackId` lookup and duplicate motion-local track support.
- PR #97 CI went red on 2026-08-07. Root cause was a parse error, not a design problem: `mountWithDelegate` and `createTrackInstance` in `packages/core/src/engines/Engine.js` opened their error messages with a backtick and closed them with a double quote, so oxc failed the transform. That single file broke the Vite production build and cascaded into 11 failing suites. The twelfth failure, `qualifiedIds.test.js`, was an unrelated bad relative import (`../../engines/Engine.js` instead of `../../../engines/Engine.js`).
- Fix pushed: template literals terminated correctly, test import path corrected, and the duplicate-qualified-id case reworked to use two identically named tracks inside one motion so it actually reaches `parseV4Project` instead of tripping the duplicate-motion-id validator first.
- Session resume: re-check PR #97 CI. If green, merge it and continue PR-18 ProjectRuntime.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E not passed
- F not passed
