# MotionPath v5 status

**Status captured:** 2026-08-08 06:40 Asia/Jakarta  
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
- Session resume: re-check PR #97 CI. If green, merge it and continue PR-18 ProjectRuntime.

## PR #97 CI history

Red run 1 was a parse error, not a design problem. `mountWithDelegate` and `createTrackInstance` in `packages/core/src/engines/Engine.js` opened their error messages with a backtick and closed them with a double quote, so oxc failed the transform. That one file broke the Vite production build and cascaded into 11 failing suites. The twelfth, `qualifiedIds.test.js`, was an unrelated bad relative import.

Red run 2 was the real one, and it exposed a policy conflict rather than a bug. `element-uniqueness` enforced project-wide track-ID uniqueness, so the duplicate motion-local track IDs that PR-17 exists to support could never validate.

## Locked decision revision: track-ID uniqueness scope

`progress/implementation/brief-12-track-id-uniqueness-scope.md` locked track-ID uniqueness as project-wide. That decision is now superseded for v5.

Brief 12's sole stated rationale was that the v3 `EditorEngine.loadProject()` built one flat `#trackIndex` keyed only by the bare track id, so cross-motion duplicates silently collided. Neither `EditorEngine` nor that flat index exists anywhere in `packages/` on v5. The implementation plan supersedes it directly: PR-17 states that bare authored IDs remain motion-local and that tracks are addressed by qualified ID.

The non-negotiable part of Brief 12 is preserved: no consumer silently resolves an ambiguous ID.

- Duplicate track ID inside one motion: error. The qualified ID would collide.
- Duplicate track ID inside the top-level `tracks[]` array: error. They share the `~` namespace.
- Same track ID in two different motions: allowed. `left/bone` and `right/bone` are distinct.
- Bare top-level ID shadowing a motion-local ID: warning at validation, and `getTrackConfig` throws on the unqualified lookup rather than picking a winner.

## Other PR-17 changes

- Top-level tracks now register under `~/trackId`, completing the free-track namespace the plan calls for.
- `/` is rejected in motion and track IDs, and `~` is rejected as a motion ID, so the qualified namespace cannot be spoofed.
- An empty top-level `tracks: []` array is now legal. `motion-structure` previously reported `Motion "top-level": tracks must have at least 1 entry` for it, which made the most natural way to declare "no free tracks" a fatal error. Motions still require at least one track.

## Carried into PR-18

`parseV4Project` still keeps a flat first-wins `trackConfigs` map, and `Engine.getTrack(id)` still scans live instances by bare ID. Both are now ambiguity-guarded rather than correct by construction. ProjectRuntime should replace them with qualified-ID-keyed registries.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E not passed
- F not passed
