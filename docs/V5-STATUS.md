# MotionPath v5 status

**Status captured:** 2026-08-08 11:40 Asia/Jakarta  
**Branch:** `v5`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)

## Executive status

The accepted implementation plan, PR-00 through PR-21, is complete and green on `v5`. Supplemental PR-22/23 work also landed. The architecture is not complete yet: observation ownership, immutability enforcement, and the GSAP boundary still need closure.

## Next step

A proposed continuation plan is now documented in [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md). It is planning-only until explicitly accepted as a named plan revision. It uses work packages `P2-00` through `P2-07`, not PR-24.

## Remaining completion work

- Establish a completion matrix and blocking boundary scans.
- Define and enforce deep immutability for graph and patch values.
- Isolate the clock and all GSAP dependencies behind approved adapters and ports.
- Move live observation mutation and edge ownership out of `Track` into `ObservationGraph`/`GraphBinding`.
- Finish the Track/Motion ownership split, including removal of Track topology and playback bridges.
- Make publisher rendering authoritative only after real-controller, lifecycle, equivalence, and rollback evidence passes.
- Remove migration-only exports and compatibility code only after the replacement path is proven.
- Run final deterministic, lifecycle, memory, package, and benchmark verification.

## Boundary

These items complete the target architecture. Cross-motion and free-track capabilities remain separate, explicitly gated product decisions. No pass-2 package is an accepted checkpoint until the continuation plan is approved.

## Landed work

PR #91 through PR #115 are merged on `v5`, including publisher delivery, public API cleanup, recursive scheduling, downstream indexing, explicit FK graph mode, runtime mode propagation, and ObservationGraph metadata/index ownership.

## Guardrails

- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Standalone mutual observation remains legal.
- No partial graph is exposed or flushed.
- No follow-up is described as an accepted planned PR without a plan revision.
- No Track observation state is removed without parity evidence.