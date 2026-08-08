# MotionPath v5 review findings

**Current source of truth:** [`V5-README.md`](./V5-README.md) and [`V5-STATUS.md`](./V5-STATUS.md).  
**Session handoff captured:** 2026-08-08 17:22 Asia/Jakarta  
**Historical source review:** [`V5-IMPLEMENTATION-REVIEW-2026-08-07.md`](./V5-IMPLEMENTATION-REVIEW-2026-08-07.md).

| # | Finding | Current status | Evidence / next action |
|---|---|---|---|
| 1 | Patch immutability was shallow | **Resolved, retain regression coverage** | PR #89 and later publisher checks. Do not weaken nested-value protection. |
| 2 | Publisher path was not wired into production flow | **Resolved as an integration seam, rollout still open** | PR #110 added the real sink, clock delivery, and React subscription path. PR #131 adds first-tick snapshot and disposal evidence. The default remains off until equivalence, scaling, retention, and rollback gates pass. |
| 3 | PR-08 evidence was described as live-style only | **Resolved** | PR #88 and current status record actual controller evidence. Older wording is historical. |
| 4 | Public exports exposed migration internals | **Resolved** | PR #111 moved migration internals behind the internal boundary and added public-boundary coverage. |
| 5 | Repeated active Motion initialization was fragile | **Resolved** | PR #90 and subsequent lifecycle checks. Keep repeated-init coverage. |
| 6 | Nested Motion scheduling was not implemented | **Resolved for the accepted plan** | PR #13 landed recursive scheduling and disposal evidence. Any remaining edge case is a new finding, not the old open item. |
| 7 | GSAP remained in core before ports | **Partially resolved / open fake-port migration** | PR #118/#126 moved production imports behind adapters and added a blocking scan plus fake-port contract coverage. Five intentional test/fixture imports remain quarantined; core production construction still needs to move fully onto Interpolator, Scheduler, and Clock ports. |
| 8 | ObservationGraph ownership was incomplete | **Partially resolved / open Track extraction** | PR #115, #119, #120, #121, #123, #127, and #128 centralize/shadow/route graph mutations and harden rollback/parity. Track still owns legacy observation maps, lifecycle wiring, and composition. Finish P2-03 before deleting that state. |
| 9 | Graph value immutability is not proven deep | **Resolved for supported shapes** | PR #117 applies one documented clone/freeze contract to patches, graph records, diagnostics, and committed GraphBinding snapshots. Foreign references remain by identity by explicit contract. |

## Rules for future updates

- Do not mark a finding resolved from a status sentence alone. Link a merged change and the relevant green evidence.
- Do not reopen a resolved finding because an old review document still contains its pre-fix wording.
- Do not turn supplemental PR-22/23 work into accepted checkpoints without revising the implementation plan.
- New findings get new numbers and a concrete owner or gate.
- Keep the session handoff branch truth in `V5-STATUS.md` and the completion matrix.
