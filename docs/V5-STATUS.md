# MotionPath v5 status

**Status captured:** 2026-08-08 11:17 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Accepted implementation plan:** complete through PR-21.

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
- PR #112 merged green: downstream invalidation index, 43.39x benchmark speedup, equal closure.
- PR #113 merged green: strict authored-graph FK validation with compatibility regression fix.
- PR #114 merged green: runtime Track mode propagation and observer teardown diagnostics.
- PR #115 merged green: ObservationGraph metadata, adjacency indexes, and collision-proof edge identity.

## Plan boundary

The accepted `docs/V5-IMPLEMENTATION-PLAN.md` defines PR-00 through PR-21. There is no planned PR-22, PR-23, or PR-24 in that document.

PR-22, PR-23, and the proposed PR-24 were follow-up work I introduced while decomposing gaps after the accepted plan. They must not be presented as part of the original plan or as new checkpoints. In particular, **PR-24 is not an authorized next job**. The status below records the extra work honestly so it is not confused with the accepted sequence.

## Supplemental follow-up work

- PR #113 and #114: FK graph-mode validation and runtime mode propagation, supplemental follow-up to the PR-14 contract.
- PR #115: ObservationGraph metadata/index ownership slice, supplemental follow-up to the PR-15 phase.
- The remaining live observation mutation extraction is an unplanned follow-up proposal, not PR-24. It requires an explicit plan revision before implementation.

These follow-ups do not create new top-level checkpoints. A future plan revision should decide whether to absorb, rename, or stop this work.

## Completed accepted gates

- Checkpoint A, PR-03: passed.
- Checkpoint B, PR-08: passed with actual controller evidence.
- Checkpoint C, PR-11: passed.
- Checkpoint D, PR-16: passed on green PR #110.
- Checkpoint E, PR-18: passed.
- Checkpoint F, PR-19: passed.
- PR-21 measurement gate: passed on green PR #112 with equal closure and 43.39x speedup in the apples-to-apples benchmark.

## Guardrails

- `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No follow-up is called a planned PR without an accepted plan revision.
- No Track observation state is removed without parity evidence.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1 through #5 are resolved; #6 remains owned by PR-12/PR-13; #7 is addressed incrementally by PRs #92 and #93. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
