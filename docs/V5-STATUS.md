# MotionPath v5 status

**Status captured:** 2026-08-08 11:13 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Next work:** PR-24, live observation mutation ownership extraction.

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

## PR-23 completion

ObservationGraph is now the immutable owner of normalized graph metadata, upstream/downstream adjacency, and edge identity. `GraphBinding` remains the live transactional mutation boundary, and standalone Track observation behavior remains unchanged. The full PR-23 suite is green: 98 files, 543 tests, plus typecheck, format, build, package, and benchmark checks.

The phase was intentionally split at the safe boundary. PR-23 did not delete Track observation state or move live mutation semantics without parity proof. That extraction is the next job, not a hidden half-finished claim.

## Next gate

PR-24 owns live observation mutation ownership: route GraphBinding and publisher updates through the ObservationGraph index, prove rollback/lifecycle/standalone parity, and only then reduce Track's managed observation state. No renderer or cross-motion changes.

## Guardrails

- `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No phase is called complete without its regression suites green.
- No Track observation state is removed without parity evidence.

## Checkpoints

Checkpoints A through F are defined in `docs/V5-IMPLEMENTATION-PLAN.md` under "Checkpoints and rollback". Current status:

| Checkpoint | Status |
| --- | --- |
| A, PR-03 | passed |
| B, PR-08 | passed with actual controller evidence |
| C, PR-11 | passed |
| D, PR-16 | passed on green PR #110 |
| E, PR-18 | passed |
| F, PR-19 | passed |

PR-23 is a phase gate, not a new top-level checkpoint. Its exit criteria are recorded in `docs/V5-PR-23-OBSERVATION-GRAPH.md` and were met by green PR #115.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1 through #5 are resolved; #6 remains owned by PR-12/PR-13; #7 is addressed incrementally by PRs #92 and #93. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
