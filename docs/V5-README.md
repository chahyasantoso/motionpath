# MotionPath v5 documentation

This is the **single entry point** for the v5 refactor docs. Read in this order.

## Current truth

1. [`V5-STATUS.md`](./V5-STATUS.md): what is landed, what is still risky, and the plan boundary.
2. [`V5-REVIEW-FINDINGS-LOG.md`](./V5-REVIEW-FINDINGS-LOG.md): reconciled findings with evidence and next actions.
3. [`V5-IMPLEMENTATION-PLAN.md`](./V5-IMPLEMENTATION-PLAN.md): accepted PR-00 through PR-21 sequence and gates.
4. [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md): accepted completion plan, pass-2 revision A, work packages P2-00 through P2-07.
5. [`V5-PASS-2-COMPLETION-MATRIX.md`](./V5-PASS-2-COMPLETION-MATRIX.md): the pass-2 control sheet of rules, owners, gaps, and gates.
6. [`V5-ARCHITECTURE-REFACTOR-PLAN.md`](./V5-ARCHITECTURE-REFACTOR-PLAN.md): target ownership and non-negotiable architecture rules.

## Supplemental implementation records

- [`V5-PR-19B-PUBLISHER-SINK.md`](./V5-PR-19B-PUBLISHER-SINK.md): publisher delivery and React subscription path.
- [`V5-PR-21-DOWNSTREAM-INDEX.md`](./V5-PR-21-DOWNSTREAM-INDEX.md): measured downstream invalidation optimization.
- [`V5-PR-22-FK-CONTRACT.md`](./V5-PR-22-FK-CONTRACT.md): explicit authored-graph versus standalone mode.
- [`V5-PR-23-OBSERVATION-GRAPH.md`](./V5-PR-23-OBSERVATION-GRAPH.md): ObservationGraph metadata/index ownership slice.
- [`V5-PASS-2-BOUNDARY-AUDIT.md`](./V5-PASS-2-BOUNDARY-AUDIT.md): pass-2 baseline commands and current boundary findings.

## Historical review

- [`V5-IMPLEMENTATION-REVIEW-2026-08-07.md`](./V5-IMPLEMENTATION-REVIEW-2026-08-07.md): preserved pre-PR-110 review, clearly marked historical.
- [`V5-MIGRATION-REVIEW-ADDENDUM.md`](./V5-MIGRATION-REVIEW-ADDENDUM.md): accepted corrections that shaped the implementation plan.

## Status vocabulary

**Accepted complete** means the original PR gate passed. **Supplemental complete** means follow-up work landed without changing the accepted plan. **Open** means evidence or implementation is still required. **Accepted plan revision** means the work is authorized to start but nothing in it is complete until its own gate is green. Never infer current status from the historical review alone.
