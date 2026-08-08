# MotionPath v5 status

**Status captured:** 2026-08-08 09:23 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Merged commit:** `b9ffbda62e12326d6ebe93a11ebe8134cf17e895`  
**Next work:** PR-20, resolving the remaining implementation-review finding #4.

## Current position

- PR #91 through PR #96 merged green: graph/runtime foundations landed.
- PR #97 through PR #101 merged green: qualified IDs, staged ProjectRuntime ownership, membership, and lookup assembly landed.
- PR #102 merged green: explicit capability gates and canonical qualified ordering.
- PR #103 merged green: pending references and explicit resolution.
- PR #104 merged green: source-unmount diagnostics and dependent-reference removal.
- PR #105 merged green: current-progress sampling without timeline control.
- PR #106 merged green: combined reference lifecycle with explicit reattachment.
- PR #107 merged green: gated `~/trackId` free-track adoption.
- PR #108 merged green: cross-motion reference validation before mutation.

## PR-19 completion

Cross-motion reference registration now rejects malformed IDs, qualified reference IDs, self-edges, unsupported roles, invalid input-role payloads, output-role inputs, and duplicate reference IDs before mutating committed state. Missing sources remain pending until explicit resolution on mount, source removal detaches dependents without silent reattachment, and free-track adoption remains separately capability-gated and off by default.

All PR-19 validation checks passed: unit tests, typecheck, format check, Vite production build, package dry run, runtime benchmark, and v5 baseline report.

## Next gate

PR-20 owns the remaining implementation-review finding #4. Keep the PR narrowly scoped, preserve the default-off capability gates, and verify success, failure, disposal, repeat execution, and no-partial-graph publication before merging.

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
- F passed: PR-19 capability and reference-validation gate complete

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is addressed incrementally by PR #96; #4 remains deferred to PR-20.
