# MotionPath v5 status

**Status captured:** 2026-08-09 13:05 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest code head:** `99e37de` (parity fix, CI re-run pending)  
**Last fully green head:** `48b6799`  
**Safe frozen baseline:** PR #142 at `184f194`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)  
**Implementation report:** [`V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md`](./V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md)  
**Next implementor handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

PR #143 is draft and went red at `51ec544`, which is the expanded parity runner
doing exactly what it was built for. Two failures, both the `unregisterObserver`
scenario, both pointing at **compatibility** ownership rather than at the scoped
adapter: the locked contract failed in compatibility mode, and the two modes
disagreed. Scoped held the contract on its own.

The defect is fixed at `8456f8c` with a regression lock at `99e37de`. The full
Node 24 matrix has not been re-run yet, so no head is claimed as verified.

## The defect, for the record

`StandaloneObservationAdapter` refcounts its module-global registry entries. The
already-registered branch of `register()` incremented that count on every call,
and `setObserved`, `replaceObserved` and `compose` all re-register their
endpoints. One holder that mutates two edges therefore counted three, so
`unregister()` decremented to two, never reached zero, and never reached
`#owner.unregister(key)`.

`removeSourceEdges` runs unconditionally, so the outgoing half of the track's
wiring was always torn down. The incoming half was not: the source kept the
unregistered observer in its observer set and `getObserverIds` kept resolving it,
for the life of the process. The refcount now counts holders, one per adapter per
Track, which is what it was always meant to mean.

This is the second bug in this slice that only existed in compatibility
ownership. The one-runner-both-adapters gate is earning its keep.

## Current state

Scoped ownership is implemented as a default-off harness and a `ProjectRuntime`
selector. Compatibility ownership remains the production default. Parity now
covers output folds, input folds, repeated mapper replacement and repeated swaps,
mutual cycles, diamond memoization, lightweight edges, destroy snapshots, detach,
duplicate public ids, shared compose contexts, `clearObserved`, `unregister`,
post-destroy reads, error paths, the public adapter surface, and `ProjectRuntime`
disposal in both modes.

## Next in line

Run the complete Node 24 matrix on `99e37de`. If it is green, parity is proven
and the next slice is a controlled runtime integration path, still behind the
explicit `observationOwnership` option.

## Guardrails

Do not merge scoped ownership based on green docs-only commits. Verify the latest
code head. When parity fails, fix the adapter: never relax a `LOCKED` entry, and
never assume the scoped side is the wrong one. Do not weaken readability or
boundary tests. Keep `publisherRendering`, `crossMotion`, and `freeTracks`
default-off.
