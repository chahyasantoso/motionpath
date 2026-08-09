# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 08:23 Asia/Jakarta  
**Control sheet:** pass-2 revision A, accepted 2026-08-08  
**Review:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Resolution log:** [`V5-PASS-2-REVIEW-STATUS.md`](./V5-PASS-2-REVIEW-STATUS.md)

A row is complete only when source evidence, regression coverage, and a green CI gate are present, and the gate actually runs.

| Target rule | Current evidence | Current gap | Owner package | Gate |
|---|---|---|---|---|
| Track is a leaf | PRs #128-#140 establish parity, explicit ownership boundaries, lifecycle fixes, and boundary evidence | Track still holds observation compatibility state, child topology, and playback bridge. F-01/F-03/F-15/F-17 remain | P2-03/P2-04 | Final Track symbol-ban plus lifecycle suites |
| Motion is the only recursive composite | PR #129 named child-slot APIs | Named APIs still lack callers; Track uses compatibility aliases | P2-04 | Nested timing, reflow, reverse, teardown |
| ObservationGraph owns graph state | PRs #115, #119-#140; F-02 now gives each ProjectRuntime one shared standalone adapter | **Still partial and inverted:** bridge derives from Track, GraphBinding rebuilds state, and Track remains a duplicate writer. F-01/F-03/F-06/F-07/F-08/F-10 | P2-03 | No Track observation state, graph/live equivalence, rollback, source removal |
| Graph and patch values are immutable | PR #117 shared deep clone/freeze contract | Foreign references remain by documented contract. Clean | P2-01 | Strict mutation attempts |
| GSAP is adapter-isolated | PRs #118/#126, blocking suite, boundary scan; ten quarantined core imports | Motion still calls `gsap.to`; React hooks have five direct imports; fake-backed production path remains open | P2-02 | Fake-backed core, strict scan, shrinking quarantine |
| Publisher path is authoritative | PR #110/#131 | Default off; payload shapes differ, flag names are duplicated, rollback path absent. F-19/F-20/F-21 | P2-05 | Compose, equivalence, retention, rollback |
| Public API matches ownership | PR #111 | Packed-artifact and deep-import cleanup remains; ticker shim is P2-06 candidate | P2-06 | Consumer fixture, export scan, pack check |
| Runtime lifecycle is failure-atomic | F-04/#140 destroy guard and F-05/#140 unsubscriber fix | Re-run full lifecycle evidence after F-01/F-03 extraction | P2-03/P2-07 | Mount, reload, failed mutation, unmount, destroy |
| Cross-motion/free-track behavior is controlled | Capability gates remain default-off | Separate product decision | P2-07 | Default-flag audit |
| Gates are real | #140 added readability ratchet and blocking boundary-scan CI job; all 8 current checks passed | Full prettier remains deferred; benchmarks still non-blocking; strict scan waits for final symbol removal | P2-00 | Every cited gate runs and can fail |

## Current branch truth

PR #140 is merged into `v5` as commit `72e7289`. Its 8-check run passed. F-04, F-05, F-11, F-12, F-14, and F-16 are closed in the resolution log.

F-02 is now implemented at the runtime boundary: `ProjectRuntime` owns one `StandaloneObservationAdapter`, exposes it to Engine-created standalone Tracks, and destroys it with the runtime. Authored graph Tracks explicitly receive `null` and remain owned by GraphBinding. Direct `new Track()` without a ProjectRuntime remains a compatibility path and must inject a shared adapter for related Tracks.

## Next sequence

1. F-01: invert the bridge. Make ObservationState authoritative, migrate GraphBinding parity/rollback and GraphPublisher cycle consumers off `Track.observedEdges`.
2. F-03: move observer queries to the adapter/state, then delete Track's duplicate maps and mutators.
3. F-06/F-07/F-08/F-10: collapse duplicate replace paths, cycle validators, the thin owner layer, and full-model rebuilds.
4. P2-04: migrate Track to Motion's named child APIs and replace inverted source-text tests with a real symbol-ban.
