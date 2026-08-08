# MotionPath v5 status

**Status captured:** 2026-08-08 11:06 Asia/Jakarta  
**Branch reviewed:** `v5` plus PR-23 ObservationGraph work  
**Next work:** PR-23, ObservationGraph ownership.

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
- PR-23 is in progress on `v5-pr-23-observation-graph`.

## PR-23 in progress

ObservationGraph now owns immutable graph metadata and adjacency indexes. The edge-key delimiter collision is fixed. GraphBinding remains the deliberate transaction boundary for live Track wiring and publisher state; no behavior is being moved out of Track until the graph and lifecycle suites prove parity.

## Guardrails

- `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No phase is called complete without its regression suites green.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1 through #5 are resolved; #6 remains owned by PR-12/PR-13; #7 is addressed incrementally by PRs #92 and #93. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
