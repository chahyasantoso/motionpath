# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-10 07:05 Asia/Jakarta  
**Implementation:** `v5-break` from clean `v5` at `e4fc9b9`  
**Historical context:** [PR #145](https://github.com/chahyasantoso/motionpath/pull/145), frozen evidence only

No row closes from stale CI, partial runs, or docs-only claims. Every phase closes with one exact-head matrix and simultaneous plan/status/matrix/handoff updates.

| Phase / target | Status | Required closure evidence |
| --- | --- | --- |
| Phase 0: clean baseline and evidence | **In progress** | Clean branch and gate cleanup committed; exact-head matrix still required. |
| Phase 1: one graph authority | Blocked | Remove facade and ownership modes; one long-lived ObservationState; no bridge rebuild; GraphBinding sole coordinator. |
| Qualified graph identity | Blocked | Canonical qualified IDs, ambiguity and cycle tests. |
| Project-wide GraphRuntime | Blocked | Two-motion shared graph, one publisher, PatchRegistry, and clock subscription. |
| Authoritative patch publication | Blocked | ObservationState plus local Track composition, immutable batches. |
| Motion composite / Track leaf | Blocked | Move topology/playback to Motion and migrate host API. |
| Graph input validation | Open | Stable missing/unknown/duplicate/role/source diagnostics. |
| Cross-motion/free-track membership | Blocked | Enable only after qualified identity and shared runtime. |
| Public API/type parity | Open | Runtime break reflected in exports, types, docs, and examples. |
| Lifecycle/rollback | Open | Owner-first teardown, idempotence, mapper-preserving rollback, stale-owner regression. |
| Handoff discipline | Active | Update plan, status, matrix, and handoff every phase close. |

## Phase 0 changes

- Clean branch created from `v5`.
- Self-blocking readability allowlist and duplicate readability suites removed.
- No PR #145 implementation commits ported.

## Required exact-head verification

```sh
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run format:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
npm run benchmark:rig
npm run benchmark:v5:baseline
```
