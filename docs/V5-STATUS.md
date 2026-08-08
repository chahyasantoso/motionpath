# MotionPath v5 status

**Status captured:** 2026-08-08 07:30 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-cross-motion-capability`  
**Base branch:** `v5`  
**Base SHA:** `65995482e4d2252a2be349ba9496f88dfdff85bc`  
**Next work:** PR-19, capability-gated cross-motion and free-track behavior.

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
- PR #101 merged green: public qualified config lookup now routes through committed ProjectRuntime membership, with failed-reload isolation coverage.
- PR-19 branch started from merged `v5` at `65995482e4d2252a2be349ba9496f88dfdff85bc`.

## PR-18 contract now enforced

A loaded project has one staged-to-committed membership boundary. Qualified track configs are registered before visibility, and a failed parse or plugin load leaves the previous project's membership and mounted instances untouched. ProjectRuntime owns the project-scoped graph runtime slot; no incomplete graph is published or flushed.

Public config lookup follows the same ownership path:

- `motionId/trackId` resolves through committed ProjectRuntime membership.
- `~/trackId` resolves through committed ProjectRuntime membership.
- Bare lookup remains motion-local; ambiguous bare config lookup returns `null`, while ambiguous mount lookup rejects loudly.
- Candidate membership is never visible during a failed reload.

## PR-19 guardrails

Cross-motion edges and free-track adoption remain **disabled by default** until correctness and canary-performance evidence exists. The capability work must preserve:

- source-unmount diagnostics and dependent-edge removal
- current-progress sampling without controlling the source timeline
- canonical qualified-ID ordering independent of mount order
- pending references that cannot publish
- explicit reattachment after a source is removed and re-added
- one project graph, publisher, clock, and membership owner

Do not enable the capability by changing the default; add explicit opt-in coverage first.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E passed for ProjectRuntime ownership and staged membership; PR-19 capability gate in progress
- F not passed

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
