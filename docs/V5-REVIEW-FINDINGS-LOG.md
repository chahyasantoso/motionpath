# V5 implementation review: findings resolution log

**Tracks:** `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Patch immutability is only shallow | resolved | PR #89, merged green |
| 2 | GraphRuntime not wired into Engine/Motion production flow | open | see note below. Owned by PR-19b |
| 3 | PR-08 was live-style, not actual Spiral controller integration | resolved | PR #88, merged green |
| 4 | Public exports expose migration internals | open | deferred to PR-20 |
| 5 | Repeated active Motion initialization remains fragile | resolved | PR #90, merged green |
| 6 | Nested Motion scheduling not implemented | open | PR-12/PR-13 |
| 7 | GSAP remains in core before ports are introduced | open | PR-12 |

## Finding #2 correction

This row previously read "open by design" with the evidence "planned integration flag and React subscription path." Neither exists. Verified against source on 2026-08-08:

- `Engine.#mountMotion` builds `new GraphPublisher({ graph, tracks: trackMap, publish: () => {} })`. The delivery callback is a no-op, so composed patches are cached and discarded.
- `Engine` imports `ProjectRuntime` only. No `GraphRuntime` and no `PatchRegistry` is constructed in any mount path.
- There is no integration flag. "Open by design" implied a deliberate switch waiting to be thrown; there is no switch.

The finding is plain open. It also blocks Checkpoint D, whose PR-16 merge gate requires publisher-backed same-motion rendering. See `docs/V5-STATUS.md`.

## PR-11 note

The original compatibility bridge was a `TrackGroup` plus `CompositeRuntime`. Both are now being removed. Dynamic demo hosts are no longer special scheduler objects: `Engine.createMotionHost` returns a normal `Motion` and its host `Track`, so child scheduling follows the same Motion-owned path as every other runtime track.
