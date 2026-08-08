# MotionPath v5 status

**Status captured:** 2026-08-08 20:14 Asia/Jakarta  
**Branch:** `v5`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. Pass-2 revision A is accepted and active. The target architecture is **not complete yet**.

Pass-2 work has now landed through the following evidence and ownership slices:

- **P2-00:** plan acceptance, completion matrix, and boundary audit infrastructure landed.
- **P2-01:** merged in PR #117. Supported graph and patch values now use one documented deep clone/freeze contract.
- **P2-02:** merged in PRs #118 and #126. Production GSAP imports are behind the adapter surface, the boundary scan is blocking, and fake port contracts exist. Core is not yet GSAP-free: intentional test/fixture imports remain quarantined and production construction has not fully moved onto ports.
- **P2-03:** merged in PRs #119, #120, #121, #123, #127, #128, #133, #134, #135, #136, #137, and #138. ObservationState composition parity is proven, graph-bound composition routes through ObservationState, standalone ownership has an explicit adapter path, factory and authored-graph construction boundaries are covered, and GraphBinding now owns initial authored wiring. The larger Track observation-state removal slice is open as PR #139, currently blocked by a unit-test failure.
- **P2-04:** merged in PRs #129 and #132. Motion exposes named child-slot ownership APIs, compatibility aliases remain, and the topology ownership evidence gate is green. Track still owns child topology and the group-host/playback bridge.
- **P2-05:** PR #131 merged the first publisher rollout evidence slice. Publisher rendering remains default-off pending real-controller equivalence, retention, rollback, and scaling evidence.

## Current open work

- **[PR #139](https://github.com/chahyasantoso/motionpath/pull/139):** P2-03 externalizes standalone observation ownership from Track. It auto-registers independent Track endpoints in the explicit adapter and adds source cleanup coverage. The latest CI run has 6 of 7 checks green; only unit tests fail. Do not merge until that failure is resolved and the full suite is green.
- Finish P2-03 by removing the remaining Track observation maps, reverse registry, graph guard, and compatibility mutators after #139 passes. Preserve standalone mutual observation through `StandaloneObservationAdapter` and authored-graph cycle validation through `GraphBinding`.
- Complete P2-02 fake-backed production construction and retire the GSAP quarantine.
- Complete P2-04 by removing Track child topology and group-host/playback bridges after parity evidence.
- Complete P2-05 with real controller/state-vector equivalence, subscriber scaling, memory retention, failure lifecycle, and an explicit rollout/rollback decision.
- Run P2-06 cleanup and P2-07 release verification, including deterministic reruns, packed-artifact consumer coverage, lifecycle smoke, memory retention, and benchmarks.

## Session handoff, 2026-08-08

The next session should start from `v5`, inspect and fix the failing unit test on **PR #139**, then rerun the complete CI gate before merging. The last failure pattern involved construction/lifecycle assumptions around standalone Track ownership, so verify direct `new Track()` callers, independently constructed source/observer pairs, source destruction cleanup, and authored-graph cycle guards. After #139 is green, continue the final Track observation symbol-ban as a separate focused slice. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default.

Do not infer completion from the PR count. P2-03 is still open until the Track symbol-ban, graph/live equivalence, rollback, source removal, repeated mutation, and lifecycle suites are green with merged evidence.

## Risks and decisions recorded

- An identical edge set is not evidence of identical behavior. P2-03 now requires value-level composition parity before deleting the legacy walk.
- Standalone and authored-graph observation are separate ownership modes. Standalone mutual observation remains legal; authored graphs remain cycle-safe.
- A standalone adapter must be shared across related Tracks. Creating an isolated adapter per Track makes valid cross-track edges look unknown.
- Initial authored wiring must have one owner. Engine and GraphRuntime now pass initial edges into GraphBinding instead of wiring them independently.
- Pending references never publish, source removal never silently reattaches dependencies, and no partial graph is exposed or flushed.

## Boundary

The refactor is complete only when the pass-2 matrix says every target rule is closed with merged source evidence and green gates. Cross-motion and free-track behavior remain separate, explicitly gated product decisions.

## Guardrails

- Standalone mutual observation remains legal.
- Authored-graph cycles are rejected before mutation.
- No Track observation state is removed without parity evidence.
- No publisher default change happens without real-controller equivalence and rollback evidence.
