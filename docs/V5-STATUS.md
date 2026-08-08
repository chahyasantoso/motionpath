# MotionPath v5 status

**Status captured:** 2026-08-08 08:58 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-cross-motion-capability`  
**Base branch:** `v5`  
**Base SHA:** `65995482e4d2252a2be349ba9496f88dfdff85bc`  
**Next work:** PR-19 capability-gated cross-motion and free-track behavior.

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
- PR-19 capability branch continues from merged `v5` at `65995482e4d2252a2be349ba9496f88dfdff85bc`.

## PR-19 slice: explicit capability gates

This slice adds no default behavior change. `ProjectRuntime` now exposes immutable capability state for `crossMotion` and `freeTracks`, both disabled by default. Callers must explicitly opt in and pass `assertCapability()` before enabling either behavior.

It also exposes a canonical sorted qualified membership order for deterministic scheduling and remount equivalence. This is groundwork only: no cross-motion edge is registered, no free track is adopted, and no source-unmount policy is enabled yet.

## Guardrails

The remaining PR-19 work must preserve source-unmount diagnostics, current-progress sampling without controlling the source timeline, pending references that cannot publish, explicit reattachment, and one project graph/publisher/clock/membership owner. Do not flip either capability on by default.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E passed for ProjectRuntime ownership and staged membership
- F not passed; PR-19 capability gate in progress

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
