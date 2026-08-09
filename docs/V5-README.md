# MotionPath v5 documentation

This is the **single entry point** for the v5 refactor docs. Read in this order.

## Current truth

1. [`V5-STATUS.md`](./V5-STATUS.md): current landed work, open PRs, risks, and session handoff.
2. [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md): full-pass implementation review, 22 findings on drift, incompleteness, and gate integrity. Read before writing any more pass-2 code.
3. [`V5-REVIEW-FINDINGS-LOG.md`](./V5-REVIEW-FINDINGS-LOG.md): reconciled findings with evidence and next actions.
4. [`V5-IMPLEMENTATION-PLAN.md`](./V5-IMPLEMENTATION-PLAN.md): accepted PR-00 through PR-21 sequence and gates.
5. [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md): accepted completion plan, pass-2 revision A, work packages P2-00 through P2-07.
6. [`V5-PASS-2-COMPLETION-MATRIX.md`](./V5-PASS-2-COMPLETION-MATRIX.md): the pass-2 control sheet of rules, evidence, gaps, and gates.
7. [`V5-ARCHITECTURE-REFACTOR-PLAN.md`](./V5-ARCHITECTURE-REFACTOR-PLAN.md): target ownership and non-negotiable architecture rules.

## Session handoff, 2026-08-08 21:10 Asia/Jakarta

PR-00 through PR-21, supplemental PR-22/23, and pass-2 evidence through **#139** are merged on `v5`. #139 landed the standalone observation externalization: standalone Tracks now receive or construct a `StandaloneObservationAdapter`, `createTrack` injects it, `ObservationState` gained `removeSourceEdges` and an injectable source composer, and `GraphPublisher.removeTrack` invalidates dependents on detach.

**PR #140** is the only current open pass-2 PR. Its Node 24 gate is green at 7 of 7 checks and it is mergeable, but see the review below before treating that as safety: two of those seven jobs are `continue-on-error`, and the format job checks two files. #140 extracts `TrackObservationOwner` and declares the Track symbol-ban in [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md); it deletes nothing from Track yet.

A full pass-2 review landed as [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md): **6 high, 10 medium, 6 low**. The three that change the plan: `ObservationState` is still derived from `Track.observedEdges` rather than authoritative over it; #139 gave every standalone Track its own adapter, reversing a recorded decision and leaving Track holding a duplicate registry; and the CI gate has real holes (format check covers two files, the pass-2 boundary scan is not in CI, two jobs cannot fail).

Next session: fix the pre-merge items in the review's recommended sequence, then merge #140, then execute the symbol-ban. Remaining work after that is Track topology/playback removal, full fake-port production migration, publisher equivalence and rollout evidence, final API cleanup, and release verification.

Treat stale empty work branches as non-work unless they gain commits and a PR, and treat #125 and #130 as superseded: both were closed unmerged and relanded as `-resolved` branches in #127 and #132.

## Supplemental implementation records

- [`V5-PR-19B-PUBLISHER-SINK.md`](./V5-PR-19B-PUBLISHER-SINK.md): publisher delivery and React subscription path.
- [`V5-PR-21-DOWNSTREAM-INDEX.md`](./V5-PR-21-DOWNSTREAM-INDEX.md): measured downstream invalidation optimization.
- [`V5-PR-22-FK-CONTRACT.md`](./V5-PR-22-FK-CONTRACT.md): explicit authored-graph versus standalone mode.
- [`V5-PR-23-OBSERVATION-GRAPH.md`](./V5-PR-23-OBSERVATION-GRAPH.md): ObservationGraph metadata/index ownership slice.
- [`V5-PASS-2-BOUNDARY-AUDIT.md`](./V5-PASS-2-BOUNDARY-AUDIT.md): pass-2 baseline commands and current boundary findings.
- [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md): target ownership split, banned Track symbols, consumers to migrate, and required removal evidence.

## Historical review

- [`V5-IMPLEMENTATION-REVIEW-2026-08-07.md`](./V5-IMPLEMENTATION-REVIEW-2026-08-07.md): preserved pre-PR-110 review, clearly marked historical.
- [`V5-MIGRATION-REVIEW-ADDENDUM.md`](./V5-MIGRATION-REVIEW-ADDENDUM.md): accepted corrections that shaped the implementation plan.

## Status vocabulary

**Accepted complete** means the original PR gate passed. **Supplemental complete** means follow-up work landed without changing the accepted plan. **Open** means evidence or implementation is still required. **Accepted plan revision** means the work is authorized to start but nothing in it is complete until its own gate is green. **Session handoff** records the current branch truth and recommended next sequence. Never infer current status from the historical review alone, and never read a green check as a passed gate without checking what that job actually runs.
