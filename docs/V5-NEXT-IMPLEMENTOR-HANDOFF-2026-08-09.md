# MotionPath v5 next implementor handoff

**Captured:** 2026-08-10 06:41 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**PR context:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Current phase:** Phase 1, establish one graph authority
**Plan:** [`V5-HARD-BREAK-IMPLEMENTATION-PLAN.md`](./V5-HARD-BREAK-IMPLEMENTATION-PLAN.md)

## Handoff truth

Phase 0 is complete. The self-blocking readability allowlist and its two test suites were removed. Prettier is now the mechanical formatting gate; architecture and GSAP boundary scans remain. No runtime behavior has been declared complete by this change.

The working branch still contains the compatibility migration and must not be treated as the hard-break implementation. The next implementor should make one deliberate ownership cut, not add another compatibility layer.

## Phase 0 commits

- `4d43b1c`: remove self-blocking readability allowlist
- `d4871b9`: remove self-blocking readability tests
- `e823324`: remove duplicate readability boundary suite
- `3f5edcb`: record Phase 0 status and next action
- `f50e0c7`: close Phase 0 in completion matrix

## Phase 1 objective

Establish one graph authority and remove duplicate ownership in the same vertical slice.

1. Delete `LegacyObservationFacade` and its unconditional call in `createTrack`.
2. Remove legacy Track observation methods/getters and move lifecycle payload construction to a neutral module.
3. Remove `observationOwnership`, `TrackObservationOwner`, `createObservationOwner`, `StandaloneObservationAdapter`, implicit owner adoption, and compatibility mutation hooks.
4. Keep one project-scoped owner backed by one long-lived `ObservationState`.
5. Delete `ObservationStateBridge` and its post-commit rebuild; use an explicit undo journal for transactions.
6. Make `GraphBinding` the sole mutation coordinator; remove topology mutation methods from `GraphPublisher`.
7. Reject cross-owner edges before either scope changes.
8. Migrate or delete affected tests, types, exports, and demos in the same commits.

## Non-negotiable tests

- runtime symbol absence across direct, factory-created, Engine standalone, and Engine-authored Tracks;
- cross-owner rejection with both scopes unchanged;
- bind, mutate, unbind does not resurrect stale owner edges;
- add/remove/replace rollback preserves `mapFn` and cache state;
- source destruction removes dependent edges exactly once;
- repeated disposal is idempotent;
- one exact-head unit, typecheck, build, package, format, boundary, and benchmark matrix.

## Do not drift

Do not touch qualified cross-motion identity, free-track enablement, publisher rollout, or P2-04 topology/playback removal until Phase 1 is green. Do not weaken assertions, reintroduce Track-owned observation state, or create a replacement compatibility facade.

## Phase close protocol

At the end of every phase, update all four together:

1. implementation plan: phase status and exact next action;
2. `V5-STATUS.md`: executive status, evidence, blockers;
3. `V5-PASS-2-COMPLETION-MATRIX.md`: row-level closure evidence;
4. this handoff: commits, exact head, remaining risks, and next implementor steps.

Only then call the phase complete. Keep the next implementor able to resume from the docs without chat context.
