# MotionPath v5 status

**Status captured:** 2026-08-08 10:45 Asia/Jakarta  
**Branch reviewed:** `v5` plus PR-21 measurement work  
**Next work:** PR-21, measurement-gated downstream invalidation index.

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
- PR #109 merged: checkpoint correction, docs only.
- PR #110 merged green: publisher sink, clock delivery, React patch subscription, and PR-16 evidence.
- PR #111 merged green: API boundary cleanup and finding #4 resolution.
- PR-21 is in progress on `v5-pr-21-downstream-index`.

## PR-21 in progress

`GraphPublisher.#markDownstream()` now uses a validated source-to-dependent adjacency index instead of scanning every node's upstream list. The optimization is intentionally not called complete yet. `benchmark:rig` now includes a rewire-heavy 60-chain x 5-node scenario, and `docs/V5-PR-21-DOWNSTREAM-INDEX.md` defines the correctness and measurement gates.

Merge only if the indexed path is materially faster in the new scenario, does not regress the existing rig benchmark, and all standard checks stay green. If it is not a clear win, revert it. No benchmark, no merge.

## Completed gates

- Checkpoint D, PR-16: passed on green PR #110.
- Checkpoint E, PR-18: passed.
- Checkpoint F, PR-19: passed.
- Finding #2: resolved by PR #110.
- Finding #4: resolved by PR #111.

## Guardrails

- `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Source sampling reads progress only and never controls another timeline.
- Canonical qualified ordering remains stable.
- No partial graph is exposed or flushed.
- No optimization merges without benchmark evidence.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1 through #5 are resolved; #6 remains owned by PR-12/PR-13; #7 is addressed incrementally by PRs #92 and #93. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
