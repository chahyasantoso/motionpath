# V5 implementation review: findings resolution log

**Tracks:** `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`  
**Rule:** a finding moves to resolved only when its PR is merged with green CI. The review document itself is a dated artifact and is not rewritten; this log carries the state.

| # | Finding | Severity | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Patch immutability is only shallow | medium | in review | PR #89, `runtime/immutablePatchValue.js` plus `PatchImmutability.test.js` |
| 2 | GraphRuntime not wired into Engine/Motion production flow | intentional | open by design | exits with the integration flag and React subscription path, not before |
| 3 | PR-08 was live-style, not actual Spiral controller integration | medium | resolved | PR #88, `useSpiralWaveController.integration.test.jsx`, merged green |
| 4 | Public exports expose migration internals | medium | open | deferred to PR-20 public exports map; no new root exports added meanwhile |
| 5 | Repeated active Motion initialization remains fragile | high | open | next planned repair, gates the PR-11 deletion |
| 6 | Nested Motion scheduling not implemented | planned | open | PR-12/PR-13 recursive scheduler proof |
| 7 | GSAP remains in core before ports are introduced | planned | open | PR-12 Interpolator/Scheduler/Clock ports |

## Notes on resolved findings

### #3, actual Spiral controller integration

The committed test mounts `useSpiralWaveController` itself, drives spawning through an injected deterministic clock, completes the entrance overlay, then compares live host output against `CompositeRuntime` publisher output and asserts the controller releases every Engine-owned instance on unmount.

Two real constraints surfaced while proving it, both worth keeping:

- The strict `GraphBinding` check is correct and load-bearing. Registering a shadow while an overlay tween is mid-flight fails, because the overlay creates a live observation edge the shadow graph does not declare. The evidence has to be taken at a settled lifecycle point, not an arbitrary one.
- The controller path cannot be exercised with GSAP stubbed wholesale, since `Engine.createGroupHost` builds a real timeline. Only Overlay tweens are shortcut; everything else runs on real GSAP.

## Sequencing decision

Checkpoint C and the PR-11 adapter deletion stay blocked. The review gates deletion on the controller evidence **and** the Motion compatibility gate, and finding #5 is still open, so `CompositeRuntime` and the `TrackGroup` bridge remain alive. Order from here: finding #1, then finding #5, then PR-11 as a pure deletion PR.
