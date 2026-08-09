# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-08 21:10 Asia/Jakarta  
**Control sheet:** pass-2 revision A, accepted 2026-08-08  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md)  
**Open review:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md), 22 findings, 6 high  
**Accountable owner:** @chaha until reassigned in the plan acceptance record

This matrix is the control sheet for completing the target architecture. A row is complete only when source evidence, regression coverage, and a green gate are all present, **and the gate is a job that actually runs**.

| Target rule | Current evidence | Current gap | Owner package | Gate |
|---|---|---|---|---|
| Track is a leaf | PRs #128, #129, #132, #133, #134, #135, #136, #137, #138, #139 | Track still holds compatibility observation methods, a duplicate observer registry, child topology, and group-host/playback bridges. #140 declares the symbol-ban and deletes nothing. F-03, F-15, F-17 | P2-03/P2-04 | Final Track symbol-ban plus lifecycle suites |
| Motion is the only recursive composite | Accepted PR-13 recursive scheduling; PR #129 named child-slot APIs | The named APIs have no callers; Track still uses `_mountChild`/`_unmountChild`/`_reflowChild`. Re-run nested timing, reflow, reverse, teardown after extraction. F-17 | P2-04 | Nested timing, reflow, reverse, teardown |
| ObservationGraph owns graph state | PR #115 metadata/index ownership; PRs #119-#121/#123/#127/#128/#133-#139 add state, parity, transaction routing, rollback, externalized standalone ownership, `removeSourceEdges`, injectable source composition, detach-time invalidation | **Partial, and inverted.** `ObservationStateBridge` derives state from `Track.observedEdges` and `GraphBinding` rebuilds it on every commit, so Track is still the authority. Four consumers of `observedEdges` must migrate before the ban. F-01, F-02, F-10 | P2-03 | No Track observation state, graph/live equivalence, rollback, source removal |
| Graph and patch values are immutable | PR #117 shared deep clone/freeze contract for supported shapes | Foreign references remain by identity by documented contract. This row is clean | P2-01 | Strict mutation attempts, green |
| GSAP is adapter-isolated | PRs #118 and #126; blocking suite `gsap-boundary.test.js` with a shrink-only allowlist | Core orchestration still calls `gsap.to` directly in `Motion`; **ten** quarantined test/fixture imports remain, not five. F-16 | P2-02 | Fake-backed core, strict import scan, shrinking quarantine |
| Publisher path is authoritative | PR #110 sink/subscription path and PR #131 first-tick/disposal evidence | Default off. The two paths deliver different subscription payload shapes, there are four names for one flag, and no rollback implementation exists. F-19, F-20, F-21 | P2-05 | One compose per dirty node/tick, equivalence, retention, rollback |
| Public API matches ownership | PR #111 public boundary and private internal surface | Final packed-artifact and deep-import cleanup follows ownership extraction; `lib/gsapTickerClock.js` shim is a documented P2-06 deletion candidate | P2-06 | Consumer fixture, export scan, pack check |
| Runtime lifecycle is failure-atomic | PR #127 rollback hardening, PR #131 disposal evidence, PR #139 source-destroy and detach cleanup | **Regressed.** `Track.destroy` is re-entrant since #139 moved notification above the guard flag, and `GraphBinding` never unsubscribes its source-destroyed listener. F-04, F-05 | P2-03/P2-07 | Mount, reload, failed mutation, unmount, destroy |
| Cross-motion/free-track behavior is controlled | Capability gates remain default-off, frozen at ProjectRuntime construction | Keep separate from architecture completion | P2-07 | Default-flag audit and explicit product decision |
| **Gates are real** | GSAP boundary and unit tests are genuinely blocking | CI format check covers two files, `boundary:v5:pass2` is not in CI, `--strict` runs nowhere, two of seven jobs are `continue-on-error`, no lint. F-11, F-12, F-13, F-14 | P2-00 | Every cited gate has a CI job that can fail |

## Current open PR

- [#140 P2-03 remove Track observation ownership seams](https://github.com/chahyasantoso/motionpath/pull/140): open at head `1935c21`, mergeable, 7 of 7 checks green, of which 5 can actually fail. Extracts `TrackObservationOwner` and records the removal contract in [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md). Land the review's four pre-merge fixes first.

## Merged pass-2 evidence

- #117 P2-01 immutable value contract.
- #118 and #126 P2-02 GSAP boundary and fake-port contracts.
- #119, #120, #121, #123, #127, and #128 P2-03 observation state, parity, transaction routing, rollback, late-track registration, and identity hardening.
- #129 and #132 P2-04 Motion child-slot ownership and topology evidence. Note: the #122 and #132 suites overlap and assert source text, see F-15.
- #131 P2-05 publisher rollout evidence slice.
- #133 and #134 P2-03 composition parity and graph-bound routing.
- #135 and #136 P2-03 explicit standalone adapter ownership and Track compatibility routing.
- #137 P2-03 factory construction boundary and authored-graph cycle-guard fixes.
- #138 P2-03 GraphBinding initial authored wiring and publisher-runtime edge handoff.
- #139 P2-03 externalized standalone observation ownership, adapter lifecycle watching, `ObservationState.removeSourceEdges`, injectable source composition, detach-time dependent invalidation. Also an unreviewed reformat of `Track.js` and `GraphPublisher.js` that deleted their reasoning comments, F-11.

Superseded, closed unmerged: #125 relanded as #127, #130 relanded as #132.

## Handoff rule

No package is complete from documentation alone, and no gate counts until a CI job runs it. The next session must clear the review's pre-merge findings, merge #140, then land the Track observation deletions with value-level and lifecycle evidence, updating this matrix only after each gate is green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default until their gates say otherwise.
