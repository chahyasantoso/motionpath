# MotionPath v5 status

**Status captured:** 2026-08-08 09:00 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-pending-references`  
**Base branch:** `v5`  
**Base SHA:** `80daeaca7f028d9a452e02af8ac701c20c12b7f6`  
**Next work:** PR-19 pending references and explicit reattachment.

## Current position

- PR #91 merged green: Checkpoint C passed.
- PR #92 merged green: GSAP adapter boundary landed.
- PR #93 merged green: recursive Motion scheduling landed.
- PR #94 merged green: explicit authored-graph input validation landed.
- PR #95 merged green: immutable ObservationGraph landed.
- PR #96 merged green: opt-in publisher-backed React subscription path landed.
- PR #97 merged green: project-local qualified IDs and motion-local duplicate track support.
- PR #98 merged green: atomic ProjectRuntime ownership and staged project visibility.
- PR #99 merged green: staged qualified membership registry.
- PR #100 merged green: ProjectRuntime owns one project-scoped graph runtime.
- PR #101 merged green: qualified config lookup routes through committed ProjectRuntime membership.
- PR #102 merged green: explicit PR-19 capability gates and canonical qualified ordering.
- Active branch adds pending-reference state and explicit resolution without enabling cross-motion behavior.

## PR-19 slice: pending references

Unresolved references are now staged as `pending`, excluded from membership lookup, and blocked from publication. They become publishable only after an explicit `resolvePendingReference()` call. Removed references do not silently reattach.

## Guardrails

`crossMotion` and `freeTracks` remain disabled by default. Source-unmount diagnostics, current-progress sampling, explicit reattachment, and canary performance remain before the capability can be enabled.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E passed for ProjectRuntime ownership and staged membership
- F not passed; PR-19 capability gate in progress

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
