# V5 implementation review: findings resolution log

**Tracks:** `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`  
**Rule:** a finding moves to resolved only when its PR is merged with green CI. The review document itself is a dated artifact and is not rewritten; this log carries the state.

| # | Finding | Severity | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Patch immutability is only shallow | medium | resolved | PR #89, `runtime/immutablePatchValue.js` plus `PatchImmutability.test.js`, merged green |
| 2 | GraphRuntime not wired into Engine/Motion production flow | intentional | open by design | exits with the integration flag and React subscription path, not before |
| 3 | PR-08 was live-style, not actual Spiral controller integration | medium | resolved | PR #88, `useSpiralWaveController.integration.test.jsx`, merged green |
| 4 | Public exports expose migration internals | medium | open | deferred to PR-20 public exports map; no new root exports added meanwhile |
| 5 | Repeated active Motion initialization remains fragile | high | resolved | PR #90, re-init is now a restart, `Motion.reinit.test.js`, merged green |
| 6 | Nested Motion scheduling not implemented | planned | open | PR-12/PR-13 recursive scheduler proof |
| 7 | GSAP remains in core before ports are introduced | planned | open | PR-12 Interpolator/Scheduler/Clock ports |

## Notes on resolved findings

### #3, actual Spiral controller integration

The committed test mounts `useSpiralWaveController` itself, drives spawning through an injected deterministic clock, completes the entrance overlay, then compares live host output against `CompositeRuntime` publisher output and asserts the controller releases every Engine-owned instance on unmount.

Two real constraints surfaced while proving it, both worth keeping:

- The strict `GraphBinding` check is correct and load-bearing. Registering a shadow while an overlay tween is mid-flight fails, because the overlay creates a live observation edge the shadow graph does not declare. The evidence has to be taken at a settled lifecycle point, not an arbitrary one.
- The controller path cannot be exercised with GSAP stubbed wholesale, since `Engine.createGroupHost` builds a real timeline. Only Overlay tweens are shortcut; everything else runs on real GSAP.

### #1, deep patch immutability

`PatchRegistry` now clones and freezes the whole supported value shape rather than freezing one level. Values are cloned, not frozen in place, because freezing in place is a side effect on an object the runtime does not own: a plugin returning a cached contribution would start throwing on its own next write. Foreign references (DOM nodes, class instances, functions) pass through by identity. Shared references stay shared and cycles terminate.

### #5, repeated Motion initialization

`init()` called `destroy()` on an active Motion, and `destroy()` also destroyed every initial Track, emptied the initial list, and tore down the trigger delegate. The second `init()` produced a Motion that reported itself active with nothing scheduled.

Re-init is now a restart: only the schedule is torn down, while Tracks, the initial list, and the graph binding survive and are rescheduled. Dynamically added children are captured from the live schedule so `_mountChild` slots are not dropped. Re-initializing a destroyed Motion throws, because its Tracks are already gone and the result could only be hollow.

## Sequencing

The PR-11 adapter deletion is now **unblocked**: the review gated it on the controller evidence and the Motion compatibility gate, and both are closed. PR-11 must stay a pure deletion PR, not a mixed refactor. Findings #2, #4, #6 and #7 keep their originally planned phases and are not pulled forward.
