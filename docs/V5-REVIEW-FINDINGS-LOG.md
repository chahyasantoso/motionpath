# V5 implementation review: findings resolution log

**Tracks:** `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Patch immutability is only shallow | resolved | PR #89, merged green |
| 2 | GraphRuntime not wired into Engine/Motion production flow | open by design | planned integration flag and React subscription path |
| 3 | PR-08 was live-style, not actual Spiral controller integration | resolved | PR #88, merged green |
| 4 | Public exports expose migration internals | open | deferred to PR-20 |
| 5 | Repeated active Motion initialization remains fragile | resolved | PR #90, merged green |
| 6 | Nested Motion scheduling not implemented | open | PR-12/PR-13 |
| 7 | GSAP remains in core before ports are introduced | open | PR-12 |

## PR-11 note

The original compatibility bridge was a `TrackGroup` plus `CompositeRuntime`. Both are now being removed. Dynamic demo hosts are no longer special scheduler objects: `Engine.createMotionHost` returns a normal `Motion` and its host `Track`, so child scheduling follows the same Motion-owned path as every other runtime track.
