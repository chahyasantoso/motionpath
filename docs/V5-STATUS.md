# MotionPath v5 status

**Status captured:** 2026-08-08 21:10 Asia/Jakarta  
**Branch:** `v5` at `9b200dc`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)  
**Open review:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. Pass-2 revision A is accepted and active. The target architecture is **not complete yet**, and a full pass-2 review has now recorded 22 open findings, 6 of them high severity.

Pass-2 work has landed through the following evidence and ownership slices:

- **P2-00:** plan acceptance, completion matrix, and boundary audit infrastructure landed. The audit script is still not wired into CI, see F-12.
- **P2-01:** merged in PR #117. Supported graph and patch values now use one documented deep clone/freeze contract. This slice is clean.
- **P2-02:** merged in PRs #118 and #126. Production GSAP imports are behind the adapter surface, the boundary is blocking through `gsap-boundary.test.js`, and fake port contracts exist. Core is not yet GSAP-free: **ten** quarantined test/fixture imports remain (nine tests, one fixture) and production construction has not moved onto ports.
- **P2-03:** merged in PRs #119, #120, #121, #123, #127, #128, #133, #134, #135, #136, #137, #138, and **#139**. Composition parity is proven and standalone ownership is externalized, but the package has drifted: `ObservationState` is still derived from `Track.observedEdges`, standalone adapters are now per-Track against a recorded decision, and Track keeps a duplicate observer registry. See F-01 through F-08.
- **P2-04:** merged in PRs #129 and #132. Motion exposes named child-slot APIs, but nothing calls them yet and the two "evidence" suites are overlapping source-text greps that assert the seams still exist. See F-15 and F-17.
- **P2-05:** PR #131 merged the first publisher rollout evidence slice. Publisher rendering remains default-off. Note F-20: the two paths deliver different subscription payload shapes, so equivalence evidence must cover shape, not just values.

## What #139 actually landed

Merged 2026-08-08 20:46 Asia/Jakarta after the unit-test gate went green. The earlier handoff note describing #139 as blocked is superseded.

- Standalone Tracks own observation through an adapter instead of inline maps: `createTrack` and the `Track` constructor create a `StandaloneObservationAdapter` when `mode === "standalone"` and none is injected. Authored-graph Tracks get no adapter and stay bound by `GraphBinding`.
- The adapter adopts independently constructed endpoints on first edge mutation, watches Track lifecycle, and reports observer IDs before source cleanup.
- `ObservationState` gained `removeSourceEdges` and an injectable `composeSource` hook.
- `GraphPublisher.removeTrack` accepts `invalidateDependents`, and `detached` now invalidates surviving dependents instead of silently dropping them.
- New coverage: `StandaloneObservationAdapter.direct-track.test.js`.

It also, unreviewed, rewrote `Track.js` and `GraphPublisher.js` into single-line dense code and deleted the recorded reasoning comments from both, including `GraphPublisher`'s notes on defensive registry copying, atomic registration, and post-disposal no-ops. See F-11.

## Current open work

- **[PR #140](https://github.com/chahyasantoso/motionpath/pull/140):** P2-03 removes Track observation ownership seams. Head `1935c21`, mergeable, 7 of 7 checks green. It extracts `TrackObservationOwner` and records the symbol-ban contract; it deletes nothing from Track. Do the review's pre-merge items first.
- Fix the four pre-merge findings: F-05 (GraphBinding pushes the wrong unsubscriber), F-04 (destroy is re-entrant since #139 moved the notification above the guard flag), F-11 and F-12 (CI format and boundary gates), F-14 (scan symbol list).
- Then run the real P2-03 removal in the review's order: decide adapter scope (F-02), invert the bridge so `ObservationState` writes and Track reads (F-01), move `observerCount`/`observerIds` onto the adapter before deleting `#observed`/`#observers` (F-03), collapse duplicate mutation paths and the three cycle validators (F-06, F-07), and justify or drop `TrackObservationOwner` (F-08).
- Complete P2-02 fake-backed production construction and shrink the ten-entry GSAP quarantine.
- Complete P2-04 by removing Track child topology and group-host/playback bridges, migrating Track onto Motion's named child API, and replacing the inverted grep suites with a real symbol-ban.
- Complete P2-05 with payload-shape and state-vector equivalence, subscriber scaling, memory retention, failure lifecycle, one flag, and a real rollback path.
- Run P2-06 cleanup and P2-07 release verification.

## Session handoff, 2026-08-08 21:10

Start from the review, not from the PR list. `V5-PASS-2-REVIEW-2026-08-08.md` has the finding IDs, the affected files, and a recommended sequence. The two things that will bite hardest if ignored: the observation model is still a projection of Track, so the symbol-ban has four consumers to migrate that #140's list does not mention; and the CI gate is five blocking jobs, one of which formats two files, so green is not evidence.

Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default.

Do not infer completion from the PR count. P2-03 is still open until the Track symbol-ban, graph/live equivalence, rollback, source removal, repeated mutation, and lifecycle suites are green with merged evidence.

## Risks and decisions recorded

- An identical edge set is not evidence of identical behavior. P2-03 requires value-level composition parity before deleting the legacy walk. Note F-18: that check is currently test-only, nothing in the production path calls it.
- Standalone and authored-graph observation are separate ownership modes. Standalone mutual observation remains legal; authored graphs remain cycle-safe.
- **Reversed and unresolved:** a standalone adapter must be shared across related Tracks. #139 made adapters per-Track and papered over it with auto-registration. The reported observer set now depends on destroy-subscriber iteration order. F-02 owns this.
- Track reports observer counts from its own registry while edges live in the adapter. Two sources of truth for one fact is the exact failure mode P2-03 exists to remove. F-03.
- Initial authored wiring must have one owner. Engine and GraphRuntime pass initial edges into GraphBinding instead of wiring them independently. The authored `mapFn` policy still lives in the Engine, F-22.
- Pending references never publish, source removal never silently reattaches dependencies, and no partial graph is exposed or flushed.
- A refactor that deletes the recorded reasons for its own invariants loses those invariants. Restore the comments #139 removed.

## Boundary

The refactor is complete only when the pass-2 matrix says every target rule is closed with merged source evidence and green gates, and when those gates actually run. Cross-motion and free-track behavior remain separate, explicitly gated product decisions.

## Guardrails

- Standalone mutual observation remains legal.
- Authored-graph cycles are rejected before mutation.
- No Track observation state is removed without parity evidence and without migrating its consumers first.
- No publisher default change happens without real-controller equivalence, payload-shape equivalence, and rollback evidence.
- No claim of enforcement without a CI job that runs it.
