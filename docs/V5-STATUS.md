# MotionPath v5 status

**Status captured:** 2026-08-08 07:20 Asia/Jakarta  
**Branch reviewed:** `v5-pr-18-runtime-assembly`  
**Base branch:** `v5`  
**Base SHA:** `685e38d7414573ceaec918cfc8e2d9cc7891cf54`  
**Active PR:** #101, ProjectRuntime qualified lookup assembly.

## Current position

- PR #91 merged green: Checkpoint C passed.
- PR #92 merged green: GSAP adapter boundary landed.
- PR #93 merged green: recursive Motion scheduling landed.
- PR #94 merged green: explicit authored-graph input validation landed.
- PR #95 merged green: immutable ObservationGraph landed.
- PR #96 merged green: opt-in publisher-backed React subscription path landed.
- PR #97 merged green: project-local qualified IDs and motion-local duplicate track support.
- PR #98 merged green: atomic ProjectRuntime ownership and staged project visibility.
- PR #99 merged green: staged qualified membership registry for `motionId/trackId` and `~/trackId`.
- PR #100 merged green: ProjectRuntime owns one project-scoped graph runtime with safe replacement and disposal.
- Active PR #101 routes public qualified config lookup through the committed ProjectRuntime membership registry and adds failed-reload isolation coverage.
- Cross-motion edges and free-track capability remain disabled pending the PR-19 correctness gate.

## PR-18 contract now enforced

A loaded project has one staged-to-committed membership boundary. Qualified track configs are registered before visibility, and a failed parse or plugin load leaves the previous project's membership and mounted instances untouched. ProjectRuntime owns the project-scoped graph runtime slot; no incomplete graph is published or flushed.

Public config lookup now follows the same ownership path:

- `motionId/trackId` resolves through committed ProjectRuntime membership.
- `~/trackId` resolves through committed ProjectRuntime membership.
- Bare lookup remains motion-local and retains the existing ambiguity guard.
- Candidate membership is never visible during a failed reload.

## Decisions carried forward

- Same track ID in different motions is valid because qualified IDs are distinct.
- Duplicate IDs inside one motion or inside top-level `tracks[]` remain errors.
- Bare top-level shadowing a motion-local ID remains a warning, and ambiguous bare lookup must throw rather than pick a winner.
- Cross-motion observation is not enabled in PR-18. Do not sneak it into lookup assembly.

## Carried into PR-19

Enable cross-motion edges and free-track capability only behind an explicit flag. Preserve source-unmount diagnostics, current-progress sampling, canonical qualified ordering, pending references that cannot publish, and explicit reattachment. PR-19 must prove mount-order determinism and canary performance before enabling the capability.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E in progress: ProjectRuntime ownership and staged membership slices merged; complete-project graph assembly continues.
- F not passed

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
