# MotionPath v5 status

**Status captured:** 2026-08-08 09:25 Asia/Jakarta  
**Branch reviewed:** `v5-pr-19-free-track-capability`  
**Branch base:** `v5`  
**Base SHA:** `fd524f80e9361eae66e384a6703be499f07e1822`  
**Next work:** PR-19 explicit free-track adoption and capability completion.

## Current position

- PR #91 through PR #96 merged green: graph/runtime foundations landed.
- PR #97 through PR #101 merged green: qualified IDs, staged ProjectRuntime ownership, membership, and lookup assembly landed.
- PR #102 merged green: explicit `crossMotion` and `freeTracks` gates with canonical ordering.
- PR #103 merged green: unresolved references stay pending and unpublished.
- PR #104 merged green: source-unmount diagnostics and explicit dependent-reference removal.
- PR #105 merged green: current-progress sampling without timeline control.
- PR #106 merged green: combined gated reference lifecycle with explicit reattachment.
- Active branch adds the explicit `~/trackId` free-track adoption API; default behavior remains unchanged.

## PR-19 slice: free-track capability

Free-track adoption now requires the `freeTracks` capability and a `~/trackId` identifier. Adoption through another namespace is rejected. The API records the instance as a free-track owner with its qualified ID, while the capability remains off by default.

## Continuation workflow

1. Read this status doc and identify the next gate.
2. Inspect the current branch, implementation, tests, and latest CI before editing.
3. Cut a branch from merged `v5`, grouping only tightly coupled work that shares one contract and rollback boundary.
4. Implement the smallest coherent slice with success, failure, disposal, repeat-execution, and default-off tests.
5. Update this status doc on the same branch with the active PR, base SHA, decisions, and next gate.
6. Open a readable Markdown PR with summary, scope, guardrails, and verification.
7. Wait for every CI check. If green, squash-merge and continue. If red, ask for the failed CI logs before changing code.

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
