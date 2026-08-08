# MotionPath v5 status

**Status captured:** 2026-08-08 09:10 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-unmount-diagnostics`  
**Base branch:** `v5`  
**Base SHA:** `9468b040f272df49a47b3ce716f830507d5cd383`  
**Next work:** PR-19 source-unmount diagnostics and explicit dependent-reference removal.

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
- PR #103 merged green: unresolved references stay pending and unpublished until explicit resolution.
- Active branch adds structured source-unmount diagnostics and removes dependent pending references without silent reattachment.

## PR-19 slice: source-unmount policy

Unmounting an owned source records `SOURCE_UNMOUNTED` with the source ID and removed dependent references. Pending references tied to that source are removed, not reattached. Re-adding the source later does nothing automatically; configuration must explicitly register or resolve the reference again.

## Workflow for every continuation session

1. Read this status doc and identify the active PR and next gate.
2. Inspect the current branch and relevant implementation/tests before editing.
3. Cut a new branch from merged `v5`, keeping one architectural concern per PR.
4. Implement the smallest coherent slice, including success, failure, disposal, and repeat-execution tests.
5. Update this status doc on the same branch with the current PR, base SHA, decisions, and next gate.
6. Open a readable Markdown PR with summary, scope, guardrails, and verification sections.
7. Wait for all CI checks. If green, squash-merge and continue. If red, ask for the failed CI logs before changing code.

## Guardrails

`crossMotion` and `freeTracks` remain disabled by default. Pending references never publish. Source removal never silently reattaches dependencies. Preserve current-progress sampling and canonical qualified ordering before enabling capability behavior.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E passed for ProjectRuntime ownership and staged membership
- F not passed; PR-19 capability gate in progress

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
