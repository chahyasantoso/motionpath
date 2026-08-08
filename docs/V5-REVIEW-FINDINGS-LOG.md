# MotionPath v5 review findings

**Current source of truth:** [`V5-README.md`](./V5-README.md) and [`V5-STATUS.md`](./V5-STATUS.md).  
**Historical source review:** [`V5-IMPLEMENTATION-REVIEW-2026-08-07.md`](./V5-IMPLEMENTATION-REVIEW-2026-08-07.md).

| # | Finding | Current status | Evidence / next action |
|---|---|---|---|
| 1 | Patch immutability was shallow | **Resolved, retain regression coverage** | PR #89 and later publisher checks. Do not weaken nested-value protection. |
| 2 | Publisher path was not wired into production flow | **Resolved** | PR #110 added the real sink, clock delivery, React subscription path, and a default-off `publisherRendering` gate. |
| 3 | PR-08 evidence was described as live-style only | **Resolved** | PR #88 and current status record actual controller evidence. Older wording is historical. |
| 4 | Public exports exposed migration internals | **Resolved** | PR #111 moved migration internals behind the internal boundary and added public-boundary coverage. |
| 5 | Repeated active Motion initialization was fragile | **Resolved** | PR #90 and subsequent lifecycle checks. Keep repeated-init coverage. |
| 6 | Nested Motion scheduling was not implemented | **Resolved for the accepted plan** | PR #13 landed recursive scheduling and disposal evidence. Any remaining edge case is a new finding, not the old open item. |
| 7 | GSAP remained in core before ports | **Partially resolved / open boundary audit** | PR #12/#13 introduced the adapter lane, but current searches still find direct GSAP imports in `packages/core/src/lib` and tests. Confirm whether each is an intentional adapter/test import and add a blocking boundary check if needed. |
| 8 | ObservationGraph ownership was incomplete | **Partially resolved** | PR #115 centralizes immutable metadata and indexes, but live mutation remains behind `GraphBinding` and standalone `Track` behavior. Full extraction needs an explicit plan revision. |
| 9 | Graph value immutability is not proven deep | **Open** | `ObservationGraph` freezes containers and shallow record copies. Define supported value shapes, then deep-freeze or clone/freeze nested values with tests. |

## Rules for future updates

- Do not mark a finding resolved from a status sentence alone. Link a merged change and the relevant green evidence.
- Do not reopen a resolved finding because an old review document still contains its pre-fix wording.
- Do not turn supplemental PR-22/23 work into accepted checkpoints without revising the implementation plan.
- New findings get new numbers and a concrete owner or gate.