# MotionPath v5 status

**Status captured:** 2026-08-08 21:05 Asia/Jakarta  
**Branch:** `v5` at `9b200dc`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. Pass-2 revision A is accepted and active. The target architecture is **not complete yet**.

Pass-2 work has now landed through the following evidence and ownership slices:

- **P2-00:** plan acceptance, completion matrix, and boundary audit infrastructure landed.
- **P2-01:** merged in PR #117. Supported graph and patch values now use one documented deep clone/freeze contract.
- **P2-02:** merged in PRs #118 and #126. Production GSAP imports are behind the adapter surface, the boundary scan is blocking, and fake port contracts exist. Core is not yet GSAP-free: intentional test/fixture imports remain quarantined and production construction has not fully moved onto ports.
- **P2-03:** merged in PRs #119, #120, #121, #123, #127, #128, #133, #134, #135, #136, #137, #138, and **#139**. ObservationState composition parity is proven, graph-bound composition routes through ObservationState, standalone ownership is externalized behind `StandaloneObservationAdapter`, factory and authored-graph construction boundaries are covered, and GraphBinding owns initial authored wiring. Track still keeps compatibility observation state, so the package remains open.
- **P2-04:** merged in PRs #129 and #132. Motion exposes named child-slot ownership APIs, compatibility aliases remain, and the topology ownership evidence gate is green. Track still owns child topology and the group-host/playback bridge.
- **P2-05:** PR #131 merged the first publisher rollout evidence slice. Publisher rendering remains default-off pending real-controller equivalence, retention, rollback, and scaling evidence.

## What #139 actually landed

Merged 2026-08-08 20:46 Asia/Jakarta after the unit-test gate went green. The previous handoff note describing #139 as blocked is superseded.

- Standalone Tracks now own observation through an adapter instead of inline maps: `createTrack` and the `Track` constructor create a `StandaloneObservationAdapter` when `mode === "standalone"` and none is injected. Authored-graph Tracks get no adapter and stay bound by `GraphBinding`.
- The adapter adopts independently constructed endpoints on first edge mutation, watches Track lifecycle, and reports observer IDs before source cleanup.
- `ObservationState` gained `removeSourceEdges` and an injectable `composeSource` hook so a source can compose through its own Track when it owns one.
- `GraphPublisher.removeTrack` accepts `invalidateDependents`, and a `detached` lifecycle event now invalidates surviving dependents instead of silently dropping them.
- New coverage: `StandaloneObservationAdapter.direct-track.test.js` for direct `new Track()` construction, source destruction cleanup, and authored-graph isolation.

## Current open work

- **[PR #140](https://github.com/chahyasantoso/motionpath/pull/140):** P2-03 removes Track observation ownership seams. Head `1935c21`, mergeable, and the complete Node 24 gate is green at 7 of 7 checks. It extracts `TrackObservationOwner` from `StandaloneObservationAdapter` and records the symbol-ban contract in [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md). It does not yet delete anything from Track.
- Finish P2-03 by removing `#observed`, `#observers`, `#graphGuard`, `_setGraphGuard`, `setObserved`, `removeObserved`, `replaceObserved`, `observedSources`, `observedEdges`, `observerCount`, and `observerIds` from Track, plus the cleanup helpers that mutate Track-owned edge state. Note that after #139 `observerCount` and `observerIds` still read Track's own reverse registry, not the adapter, so that divergence must be closed as part of the removal.
- Complete P2-02 fake-backed production construction and retire the GSAP quarantine.
- Complete P2-04 by removing Track child topology and group-host/playback bridges after parity evidence.
- Complete P2-05 with real controller/state-vector equivalence, subscriber scaling, memory retention, failure lifecycle, and an explicit rollout/rollback decision.
- Run P2-06 cleanup and P2-07 release verification, including deterministic reruns, packed-artifact consumer coverage, lifecycle smoke, memory retention, and benchmarks.

## Session handoff, 2026-08-08 21:05

Start from `v5`. #140 is green and ready, so merge it first, then execute the symbol-ban as focused commits against the eight evidence items in [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md). Verify direct `new Track()` callers, shared-adapter mutual observation and diamond memoization, source destruction cleanup, child detachment republish, authored-graph cycle rejection, GraphBinding transaction rollback, and repeated-mutation idempotency. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default.

Do not infer completion from the PR count. P2-03 is still open until the Track symbol-ban, graph/live equivalence, rollback, source removal, repeated mutation, and lifecycle suites are green with merged evidence.

## Risks and decisions recorded

- An identical edge set is not evidence of identical behavior. P2-03 requires value-level composition parity before deleting the legacy walk.
- Standalone and authored-graph observation are separate ownership modes. Standalone mutual observation remains legal; authored graphs remain cycle-safe.
- A standalone adapter must be shared across related Tracks. #139 makes an auto-created adapter safe by adopting endpoints on first mutation, but any caller that owns a standalone group should still inject one shared adapter explicitly.
- Track currently reports observer counts from its own registry while edges live in the adapter. Two sources of truth for the same fact is the exact failure mode P2-03 exists to remove.
- Initial authored wiring must have one owner. Engine and GraphRuntime pass initial edges into GraphBinding instead of wiring them independently.
- Pending references never publish, source removal never silently reattaches dependencies, and no partial graph is exposed or flushed.

## Boundary

The refactor is complete only when the pass-2 matrix says every target rule is closed with merged source evidence and green gates. Cross-motion and free-track behavior remain separate, explicitly gated product decisions.

## Guardrails

- Standalone mutual observation remains legal.
- Authored-graph cycles are rejected before mutation.
- No Track observation state is removed without parity evidence.
- No publisher default change happens without real-controller equivalence and rollback evidence.
