# MotionPath v5 status

**Status captured:** 2026-08-08 09:20 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-reference-lifecycle`  
**Branch base:** `v5`  
**Base SHA:** `7521abad7a2cc5dae7421a89b0d3f079185e8899`  
**Next work:** PR-19 reference lifecycle, combining gated registration, pending resolution, source sampling, and explicit reattachment.

## Current position

- PR #91 through PR #96 merged green: graph/runtime foundations landed.
- PR #97 through PR #101 merged green: qualified IDs, staged ProjectRuntime ownership, membership, and lookup assembly landed.
- PR #102 merged green: explicit `crossMotion` and `freeTracks` gates with canonical ordering.
- PR #103 merged green: unresolved references stay pending and unpublished.
- PR #104 merged green: source-unmount diagnostics and explicit dependent-reference removal.
- PR #105 merged green: current-progress sampling without timeline control.
- Active branch combines the remaining compatible PR-19 lifecycle pieces into one tested slice.

## Combined PR-19 slice

Cross-motion references now require explicit `crossMotion` capability. A reference with a missing source is `pending`, becomes `ready` only when that exact source is mounted, and can be sampled without controlling the source timeline. Unmounting the source removes the reference and records `SOURCE_UNMOUNTED`; re-adding the source does not recreate it. Reattachment requires an explicit new registration.

`freeTracks` remains separately gated and disabled by default. No capability default changes here.

## Continuation workflow

1. Read this status doc and identify the next gate.
2. Inspect the current branch, implementation, tests, and latest CI before editing.
3. Cut a branch from merged `v5`, grouping only tightly coupled work that shares one contract and rollback boundary.
4. Implement the smallest coherent slice with success, failure, disposal, repeat-execution, and default-off tests.
5. Update this status doc on the same branch with the active PR, base SHA, decisions, and next gate.
6. Open a readable Markdown PR with summary, scope, guardrails, and verification.
7. Wait for every CI check. If green, squash-merge and continue. If red, ask for the failed logs before changing code.

## Guardrails

- `crossMotion` and `freeTracks` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Source sampling reads progress only and never controls another timeline.
- Canonical qualified ordering remains stable.
- No partial graph is exposed or flushed.

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D pending full PR-16 staged visibility evidence
- E passed for ProjectRuntime ownership and staged membership
- F not passed; PR-19 capability gate in progress

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
