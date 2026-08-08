# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-08 17:22 Asia/Jakarta  
**Control sheet:** pass-2 revision A, accepted 2026-08-08  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md)  
**Accountable owner:** @chaghe until reassigned in the plan acceptance record

This matrix is the control sheet for completing the target architecture. A row is complete only when source evidence, regression coverage, and a green gate are all present.

| Target rule | Current evidence | Current gap | Owner package | Gate |
|---|---|---|---|---|
| Track is a leaf | PRs #128, #129, and the open #132 evidence slice establish parity identity and Motion child-slot APIs | Track still owns observation maps/composition, child topology, and group-host/playback bridges | P2-03/P2-04 | Final Track symbol-ban plus lifecycle suites |
| Motion is the only recursive composite | Accepted PR-13 recursive scheduling; PR #129 named child-slot APIs | Re-run nested timing, reflow, reverse, teardown after Track extraction | P2-04 | Nested timing, reflow, reverse, teardown |
| ObservationGraph owns graph state | PR #115 metadata/index ownership; PRs #119-#121/#123/#127/#128 add ObservationState, parity, transaction routing, rollback, late-track, and identity evidence | Track remains the compatibility mirror and still owns live observation composition/state | P2-03 | No Track observation state, graph/live equivalence, rollback, source removal |
| Graph and patch values are immutable | PR #117 shared deep clone/freeze contract for supported shapes | Foreign references remain by identity by documented contract | P2-01 | Strict mutation attempts, green |
| GSAP is adapter-isolated | PRs #118 and #126 moved production imports behind adapters, added blocking scan, and added fake-port contracts | Core orchestration still loads GSAP through adapter-backed construction; five intentional test/fixture imports remain quarantined | P2-02 | Fake-backed core, strict import scan, shrinking quarantine |
| Publisher path is authoritative | PR #110 sink/subscription path and PR #131 first-tick/disposal evidence | Default remains off; real controller equivalence, scaling, retention, failure lifecycle, and rollback evidence remain | P2-05 | One compose per dirty node/tick, equivalence, retention, rollback |
| Public API matches ownership | PR #111 public boundary and private internal surface | Final packed-artifact and deep-import cleanup follows ownership extraction | P2-06 | Consumer fixture, export scan, pack check |
| Runtime lifecycle is failure-atomic | Existing lifecycle evidence plus PR #127 rollback hardening and PR #131 disposal evidence | Re-run after Track ownership removal and publisher rollout | P2-03/P2-07 | Mount, reload, failed mutation, unmount, destroy |
| Cross-motion/free-track behavior is controlled | Capability gates remain default-off | Keep separate from architecture completion | P2-07 | Default-flag audit and explicit product decision |

## Current open PR

- [#132 P2-04 Track topology ownership evidence](https://github.com/chahyasantoso/motionpath/pull/132), open and running its current-v5 CI after superseding stale #130.

## Merged pass-2 evidence

- #117 P2-01 immutable value contract.
- #118 and #126 P2-02 GSAP boundary and fake-port contracts.
- #119, #120, #121, #123, #127, and #128 P2-03 observation state, parity, transaction routing, rollback, late-track registration, and identity hardening.
- #129 P2-04 Motion child-slot ownership.
- #131 P2-05 publisher rollout evidence.

## Handoff rule

No package is complete from documentation alone. The next session must update this matrix with merged evidence, not optimism. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default until their gates say otherwise.
