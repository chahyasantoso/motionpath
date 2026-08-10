# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-10 07:21 Asia/Jakarta  
**Implementation:** Phase 1 on `v5-break` from clean `v5` at `e4fc9b9`  
**Draft PR:** [#146](https://github.com/chahyasantoso/motionpath/pull/146)  
**Historical context:** [#145](https://github.com/chahyasantoso/motionpath/pull/145), frozen evidence only

No row closes from stale CI, partial runs, or docs-only claims. Every phase closes with one exact-head matrix and simultaneous plan/status/matrix/handoff updates.

| Phase / target | Status | Required closure evidence |
| --- | --- | --- |
| Phase 0: clean baseline and evidence | **Closed** | Exact-head PR #146 matrix green after manifest and alias fixes. |
| Phase 1: one graph authority | **In progress** | First authority cut at `321ce97`: factory facade removed and GraphBinding override seam removed. Remaining: one owner, stable ObservationState, no bridge rebuild, cross-owner rejection, publisher mutation cut, contract suite green. |
| Qualified graph identity | Blocked | Canonical qualified IDs, ambiguity and cycle tests. |
| Project-wide GraphRuntime | Blocked | Two-motion shared graph, one publisher, PatchRegistry, and clock subscription. |
| Authoritative patch publication | Blocked | ObservationState plus local Track composition, immutable batches. |
| Motion composite / Track leaf | Blocked | Move topology/playback to Motion and migrate host API. |
| Graph input validation | Open | Stable missing/unknown/duplicate/role/source diagnostics. |
| Cross-motion/free-track membership | Blocked | Enable only after qualified identity and shared runtime. |
| Public API/type parity | Open | Runtime break reflected in exports, types, docs, and examples. |
| Lifecycle/rollback | Open | Owner-first teardown, idempotence, mapper-preserving rollback, stale-owner regression. |
| Handoff discipline | Active | Update plan, status, matrix, and handoff every phase close. |

## Phase 1 required commands

```sh
npm run test:phase1-contract
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
