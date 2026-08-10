# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-10 07:12 Asia/Jakarta  
**Implementation:** `v5-break` from clean `v5` at `e4fc9b9`  
**Draft PR:** [#146](https://github.com/chahyasantoso/motionpath/pull/146)  
**Historical context:** [#145](https://github.com/chahyasantoso/motionpath/pull/145), frozen evidence only

No row closes from stale CI, partial runs, or docs-only claims. Every phase closes with one exact-head matrix and simultaneous plan/status/matrix/handoff updates.

| Phase / target | Status | Required closure evidence |
| --- | --- | --- |
| Phase 0: clean baseline and evidence | **Reconciliation in progress** | Ten future-contract suites isolated without assertion changes; current-suite `npm test` and exact-head matrix still required. |
| Phase 1: one graph authority | Blocked | Re-enable and make Track, adapter, GraphBinding, and lifecycle contract suites green through the owner cut. |
| Qualified graph identity | Blocked | Canonical qualified IDs, ambiguity and cycle tests. |
| Project-wide GraphRuntime | Blocked | Two-motion shared graph, one publisher, PatchRegistry, and clock subscription. |
| Authoritative patch publication | Blocked | ObservationState plus local Track composition, immutable batches. |
| Motion composite / Track leaf | Blocked | Move topology/playback to Motion and migrate host API. |
| Graph input validation | Open | Stable missing/unknown/duplicate/role/source diagnostics. |
| Cross-motion/free-track membership | Blocked | Enable only after qualified identity and shared runtime. |
| Public API/type parity | Open | Runtime break reflected in exports, types, docs, and examples. |
| Lifecycle/rollback | Open | Owner-first teardown, idempotence, mapper-preserving rollback, stale-owner regression. |
| Handoff discipline | Active | Update plan, status, matrix, and handoff every phase close. |

## Test commands

- `npm test` or `npm run test:phase0`: current v5 baseline gate.
- `npm run test:phase1-contract`: intentionally red future-contract suites, preserved for Phase 1/2 work.

The contract suites are not deleted, skipped inside their files, or weakened. They are excluded only from the Phase 0 baseline command and must be promoted back as each owning phase closes.

## Required exact-head verification

```sh
npm test
npm run typecheck
npm run build
npm run pack:check
npm run format:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
npm run benchmark:rig
npm run benchmark:v5:baseline
```
