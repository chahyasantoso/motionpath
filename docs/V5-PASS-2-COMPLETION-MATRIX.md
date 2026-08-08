# MotionPath v5 pass-2 completion matrix

**Work package:** P2-00  
**Branch:** `v5-pass-2-p2-00-baseline`  
**Status:** accepted control sheet, baseline and audit in progress  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md), accepted as pass-2 revision A on 2026-08-08  
**Accountable owner:** @chahyasantoso for every row until reassigned in the plan acceptance record

This matrix is the control sheet for completing the target architecture. A row is not complete from documentation alone: it needs source evidence, regression coverage, and a green gate.

| Target rule | Current evidence | Gap | Owner package | Owner | Gate |
|---|---|---|---|---|---|
| Track is a leaf | `Track` still owns observation maps, child topology, and a group-host bridge | Move live graph state and topology/playback seams out of `Track` | P2-03/P2-04 | @chahyasantoso | Track symbol-ban and lifecycle suites |
| Motion is the only recursive composite | PR-13 recursive scheduling landed | Re-run after Track ownership extraction | P2-04 | @chahyasantoso | Nested timing, reflow, reverse, teardown |
| ObservationGraph owns graph state | PR-115 owns normalized metadata and indexes | Live mutation still routes through `Track` and `GraphBinding` | P2-03 | @chahyasantoso | Graph/live equivalence and rollback |
| Graph and patch values are immutable | **P2-01 landed:** one shared contract in `contract/immutableValue.js`, applied to patches, `ObservationGraph`, and committed `GraphBinding` snapshots, documented in [`V5-PASS-2-IMMUTABLE-VALUE-CONTRACT.md`](./V5-PASS-2-IMMUTABLE-VALUE-CONTRACT.md) | Closed for supported shapes. Foreign references (DOM nodes, class instances, `Map`/`Set`) remain by-identity by contract | P2-01 | @chahyasantoso | Strict-mode mutation attempts, green |
| GSAP is adapter-isolated | Adapter modules exist | Direct imports remain in `packages/core/src/lib` and tests | P2-02 | @chahyasantoso | Strict import-boundary scan and fake-backed core |
| Publisher path is authoritative | PR-110 added sink and subscription path, default remains off | Need final controller/lifecycle equivalence before changing authority/default | P2-05 | @chahyasantoso | One compose per node/tick, visual/state equivalence, retention |
| Public API matches ownership | PR-111 added export boundary | Recheck packed artifact after final cleanup | P2-06 | @chahyasantoso | Consumer fixture, export scan, pack check |
| Runtime lifecycle is failure-atomic | Green lifecycle evidence exists | Re-run after ownership extraction and cleanup | P2-03/P2-07 | @chahyasantoso | Mount, reload, failed mutation, unmount, destroy |
| Cross-motion/free-track behavior is controlled | Capability gates are default-off | Keep separate from architecture completion | P2-07 | @chahyasantoso | Default-flag audit and explicit product decision |

## Required evidence artifacts

- `docs/V5-PASS-2-COMPLETION-MATRIX.md`, this matrix.
- `docs/V5-PASS-2-BOUNDARY-AUDIT.md`, generated or refreshed by the boundary audit.
- `docs/V5-PASS-2-IMMUTABLE-VALUE-CONTRACT.md`, the P2-01 value contract.
- `docs/benchmarks/v5-baseline.json`, existing baseline refreshed before behavior changes.
- Test and CI links for every completed package.

## Exit criteria for P2-00

- The continuation plan is accepted as a named revision. Done: pass-2 revision A, 2026-08-08.
- Every remaining target rule has a named package, a named owner, and a pass/fail gate.
- Boundary scans cover Track responsibilities, GSAP imports, migration symbols, and package exports.
- Baseline commands are recorded before P2-01 or P2-02 changes land.
- Current violations are visible and not mislabeled as completed work.
