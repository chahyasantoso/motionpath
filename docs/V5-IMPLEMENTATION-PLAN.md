# MotionPath v5 implementation plan

**Status:** accepted execution plan, complete through PR-21  
**Implementation base:** `v5`  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Supplemental records:** PR-22 and PR-23 are follow-up work, not new accepted checkpoints.

## Accepted sequence

PR-00 through PR-21 remain the accepted delivery sequence. Their original gates, rollback rules, CI requirements, and one-concern-per-PR discipline remain binding. The sequence is complete on `v5` with green evidence recorded in [`V5-STATUS.md`](./V5-STATUS.md).

The key gates are: lifecycle and graph transaction safety at PR-03, compatibility/live Spiral evidence at PR-08, migration cleanup at PR-11, publisher-backed same-motion rendering at PR-16, atomic ProjectRuntime visibility at PR-18, cross-motion/free-track correctness and canary performance at PR-19, public API cleanup at PR-20, and measured optimization at PR-21.

## Reconciled current state

- PR-13 recursive Motion scheduling is landed. The old finding that nested Motion scheduling was not implemented is historical and must not remain open.
- PR-20 public API cleanup is landed. Migration internals are behind the internal entrypoint rather than the package root.
- PR-21 downstream indexing is landed with equal closure and a 43.39x measured speedup.
- PR-22 closes the explicit authored-graph FK mode contract as supplemental follow-up.
- PR-23 centralizes ObservationGraph metadata and indexes as supplemental follow-up, but does not finish live mutation extraction from Track.
- The remaining deep-immutability and GSAP-boundary concerns are findings, not silently completed gates.

## Guardrails that remain active

- No partial graph is renderable or flushable.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Cross-motion, free-track adoption, and publisher rendering remain default-off capabilities.
- Cycle protection and diagnostics must survive rollback and extraction work.
- No supplemental follow-up becomes a new checkpoint without an explicit accepted plan revision.

## Documentation source of truth

For current status, use [`V5-README.md`](./V5-README.md), [`V5-STATUS.md`](./V5-STATUS.md), and [`V5-REVIEW-FINDINGS-LOG.md`](./V5-REVIEW-FINDINGS-LOG.md). The detailed original PR-by-PR plan is preserved by the repository history; this file records its accepted boundary and current reconciliation.