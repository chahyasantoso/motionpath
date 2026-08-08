# MotionPath v5 status

**Status captured:** 2026-08-08 11:29 Asia/Jakarta  
**Branch:** `v5`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. The implementation is **not a final architecture-complete release**: the accepted delivery gates passed, but supplemental follow-up work exposed remaining boundary and documentation work that must not be silently folded into the original plan.

## Landed work

- PR #91 through PR #96: graph/runtime foundations.
- PR #97 through PR #101: qualified IDs, ProjectRuntime ownership, membership, and lookup assembly.
- PR #102 through PR #108: capability gates, pending references, lifecycle policy, sampling, free-track adoption, and pre-mutation validation.
- PR #109: checkpoint correction.
- PR #110: publisher sink, clock delivery, React patch subscription, and PR-16 evidence.
- PR #111: public API boundary cleanup.
- PR #112: downstream invalidation index, equal closure, and 43.39x apples-to-apples speedup.
- PR #113 and #114: explicit authored-graph FK validation, runtime mode propagation, and teardown diagnostics.
- PR #115: ObservationGraph metadata, adjacency indexes, and collision-proof edge identity.

## Accepted gates

- Checkpoints A through F: passed according to the recorded green checks.
- PR-21 measurement gate: passed with equal closure and 43.39x speedup.
- Default flags remain conservative: `crossMotion`, `freeTracks`, and `publisherRendering` are disabled by default.

## Current findings

1. **Deep immutability:** the graph value object freezes containers and direct records, but nested user-owned values are not proven deeply immutable. Treat this as a contract hardening item.
2. **Live observation mutation ownership:** `GraphBinding` still owns the live transaction boundary and standalone `Track` observation behavior remains. Full extraction from `Track` is not complete.
3. **GSAP boundary:** direct GSAP imports remain in core-adjacent runtime/test paths. The architecture target of no GSAP imports outside adapters is not fully demonstrated.
4. **Controller evidence:** the repository now records actual controller evidence for Checkpoint B, but older review wording remains historical and must not be used as current status.
5. **Documentation drift:** older review text reflects the pre-PR-110 state. Use `V5-README.md`, this file, and `V5-REVIEW-FINDINGS-LOG.md` as the current source of truth.

## Supplemental work boundary

PR-22, PR-23, and any proposed PR-24 are supplemental follow-up work. They are not new accepted checkpoints and do not extend the original PR-00 through PR-21 plan. Remaining observation mutation extraction requires an explicit plan revision before implementation.

## Guardrails

- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No follow-up is described as an accepted planned PR without a plan revision.
- No Track observation state is removed without parity evidence.