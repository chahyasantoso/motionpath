# MotionPath v5 status

**Status captured:** 2026-08-08 19:40 Asia/Jakarta  
**Branch:** `v5`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. Pass-2 revision A is accepted and active. The target architecture is **not complete yet**.

Pass-2 work has now landed through several evidence and ownership slices:

- **P2-00:** plan acceptance, completion matrix, and boundary audit infrastructure landed.
- **P2-01:** merged in PR #117. Supported graph and patch values now use one documented deep clone/freeze contract.
- **P2-02:** merged in PRs #118 and #126. Production GSAP imports are behind the adapter surface, the boundary scan is blocking, and fake port contracts exist. Core is not yet GSAP-free: intentional test/fixture imports remain quarantined and production construction has not fully moved onto ports.
- **P2-03:** merged in PRs #119, #120, #121, #123, #127, and #128. ObservationState, parity validation, transactional mutation routing, rollback hardening, late-track registration, and collision-proof bridge identity are in place. PR #133 is open for composition ownership. Track still owns the legacy observation maps, so extraction is not complete.
- **P2-04:** merged in PRs #129 and #132. Motion exposes named child-slot ownership APIs, compatibility aliases remain, and the topology ownership evidence gate is green. Track still owns child topology and the group-host/playback bridge.
- **P2-05:** PR #131 merged the first publisher rollout evidence slice. Publisher rendering remains default-off pending real-controller equivalence, retention, rollback, and scaling evidence.

## Current open work

- [PR #133](https://github.com/chahyasantoso/motionpath/pull/133): P2-03 composition ownership. Moves the observation composition walk onto `ObservationState` with patch-for-patch equivalence evidence against the live `Track` walk, adds `Track.composeLocal()` as the explicit leaf seam, and moves the shared compose-context marker into `usecases/composeContext.js`. Removes nothing.
- Complete P2-03 by routing `Track.compose` onto the observation handle, then remove the legacy Track observation state and mutators.
- Complete P2-02 fake-backed production construction and retire the GSAP quarantine.
- Complete P2-04 by removing Track child topology and group-host/playback bridges after parity evidence.
- Complete P2-05 with real controller/state-vector equivalence, subscriber scaling, memory retention, failure lifecycle, and an explicit rollout/rollback decision.
- Run P2-06 cleanup and P2-07 release verification, including deterministic reruns, packed-artifact consumer coverage, lifecycle smoke, memory retention, and benchmarks.

## Risks found while building the P2-03 evidence

The shadow `ObservationState` walker was **not** a drop-in replacement for the live `Track` walk, and wiring parity did not show it. Three defects, all fixed in #133:

1. The re-entry guard was checked after the ctx cache hit, so a legal standalone back-edge returned the in-progress marker `Symbol` instead of a patch. The branch was unreachable.
2. Output contributions merged with a shallow spread instead of `mergePatches`, so any nested patch value composed differently.
3. The base source was defaulted inside the input loop, so a track with no input edge handed `undefined` to the leaf.

**Lesson for the remaining slices:** an identical edge set is not evidence of identical behavior. Every ownership move still to come needs a value-level equivalence assertion, not a structural one.

## Handoff decision

The next session should treat `v5` as the source branch. First finish and merge #133 if its CI is green. Then flip `Track.compose` onto the observation handle as its own focused change, and only after that remove the legacy Track observation state. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default. Do not delete compatibility shims or quarantine entries until parity and rollback evidence is merged.

## Boundary

The refactor is complete only when the pass-2 matrix says every target rule is closed with merged source evidence and green gates. Cross-motion and free-track behavior remain separate, explicitly gated product decisions.

## Guardrails

- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No Track observation state is removed without parity evidence.
- No publisher default change happens without real-controller equivalence and rollback evidence.
