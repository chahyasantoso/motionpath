# MotionPath v5 status

**Status captured:** 2026-08-08 17:22 Asia/Jakarta  
**Branch:** `v5`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. Pass-2 revision A is accepted and active. The target architecture is **not complete yet**.

Pass-2 work has now landed through several evidence and ownership slices:

- **P2-00:** plan acceptance, completion matrix, and boundary audit infrastructure landed.
- **P2-01:** merged in PR #117. Supported graph and patch values now use one documented deep clone/freeze contract.
- **P2-02:** merged in PRs #118 and #126. Production GSAP imports are behind the adapter surface, the boundary scan is blocking, and fake port contracts exist. Core is not yet GSAP-free: intentional test/fixture imports remain quarantined and production construction has not fully moved onto ports.
- **P2-03:** merged in PRs #119, #120, #121, #123, #127, and #128. ObservationState, parity validation, transactional mutation routing, rollback hardening, late-track registration, and collision-proof bridge identity are in place. Track still owns the legacy observation maps and composition, so extraction is not complete.
- **P2-04:** PR #129 merged. Motion now exposes named child-slot ownership APIs while compatibility aliases remain. PR #132 is open for the topology ownership evidence gate. Track still owns child topology and the group-host/playback bridge.
- **P2-05:** PR #131 merged the first publisher rollout evidence slice. Publisher rendering remains default-off pending real-controller equivalence, retention, rollback, and scaling evidence.

## Current open work

- [PR #132](https://github.com/chahyasantoso/motionpath/pull/132): P2-04 Track topology ownership evidence, rebuilt on current `v5` after the stale PR #130 was superseded.
- Complete P2-02 fake-backed production construction and retire the GSAP quarantine.
- Complete P2-03 by moving observation composition and lifecycle ownership out of Track, then remove the legacy Track observation state.
- Complete P2-04 by removing Track child topology and group-host/playback bridges after parity evidence.
- Complete P2-05 with real controller/state-vector equivalence, subscriber scaling, memory retention, failure lifecycle, and an explicit rollout/rollback decision.
- Run P2-06 cleanup and P2-07 release verification, including deterministic reruns, packed-artifact consumer coverage, lifecycle smoke, memory retention, and benchmarks.

## Handoff decision

The next session should treat `v5` as the source branch. First finish and merge #132 if its CI is green. Then continue P2-03 Track observation extraction and P2-04 topology removal as separate focused changes. Keep `publisherRendering`, `crossMotion`, and `freeTracks` disabled by default. Do not delete compatibility shims or quarantine entries until parity and rollback evidence is merged.

## Boundary

The refactor is complete only when the pass-2 matrix says every target rule is closed with merged source evidence and green gates. Cross-motion and free-track behavior remain separate, explicitly gated product decisions.

## Guardrails

- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No Track observation state is removed without parity evidence.
- No publisher default change happens without real-controller equivalence and rollback evidence.
