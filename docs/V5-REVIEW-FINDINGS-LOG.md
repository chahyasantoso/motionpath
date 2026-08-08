# V5 implementation review: findings resolution log

**Tracks:** `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Patch immutability is only shallow | resolved | PR #89, merged green |
| 2 | GraphRuntime not wired into Engine/Motion production flow | resolved | PR-19b, `docs/V5-PR-19B-PUBLISHER-SINK.md` |
| 3 | PR-08 was live-style, not actual Spiral controller integration | resolved | PR #88, merged green |
| 4 | Public exports expose migration internals | open | deferred to PR-20 |
| 5 | Repeated active Motion initialization remains fragile | resolved | PR #90, merged green |
| 6 | Nested Motion scheduling not implemented | open | PR-12/PR-13 |
| 7 | GSAP remains in core before ports are introduced | open | PR-12 |

## Finding #2 history

This row read "open by design" with the evidence "planned integration flag and React subscription path." Neither existed. Verified against source on 2026-08-08:

- `Engine.#mountMotion` built `new GraphPublisher({ graph, tracks: trackMap, publish: () => {} })`. The delivery callback was a no-op, so composed patches were cached and discarded.
- `Engine` imported `ProjectRuntime` only. No `GraphRuntime` and no `PatchRegistry` was constructed in any mount path, and `GraphPublisher.flush()` had no production caller.
- There was no integration flag. "Open by design" implied a switch waiting to be thrown; there was no switch.

PR #109 corrected the row to plain **open**. PR-19b closes it: the flag now exists (`Engine.publisherRendering`, default off), the sink is real, and the React subscription path reads published patches. Details and the deliberate non-goals are in `docs/V5-PR-19B-PUBLISHER-SINK.md`.

The row stays "resolved" only while the gate has a real sink behind it. If a future PR reintroduces a placeholder publish callback, this is a regression, not a staging step.

## PR-11 note

The original compatibility bridge was a `TrackGroup` plus `CompositeRuntime`. Both are now being removed. Dynamic demo hosts are no longer special scheduler objects: `Engine.createMotionHost` returns a normal `Motion` and its host `Track`, so child scheduling follows the same Motion-owned path as every other runtime track.
