# MotionPath v5 hard-break implementation plan

**Repo:** `chahyasantoso/motionpath`  
**Implementation branch:** `v5-break`, created from clean `v5` at `e4fc9b9`  
**Historical evidence:** [PR #145](https://github.com/chahyasantoso/motionpath/pull/145), not an implementation base  
**Date:** 2026-08-10  
**Decision:** preserve the v4 authored schema (`schemaVersion: 4`), break the runtime API, and deliver the target architecture in five vertical phases.

## Operating rules

- `v5-break` is the only implementation branch for this plan.
- PR #145 is frozen evidence. Do not port its history wholesale.
- Keep every phase reviewable: no repository-wide formatting commits mixed with behavior.
- If a phase exceeds roughly 25 commits or takes a second revert, stop and re-cut it.
- Every phase closes with one exact-head CI matrix and simultaneous updates to the plan, status, completion matrix, and handoff.
- Never declare completion from stale CI, partial runs, or docs-only claims.

## Target architecture

```text
Engine -> one ProjectRuntime
ProjectRuntime -> one qualified ObservationGraph, ObservationState, GraphBinding,
                  GraphPublisher/PatchRegistry, and Clock subscription
Motion -> topology, scheduling, triggers, playback
Track -> playhead, interpolation, local plugin composition only
Adapters -> GSAP, DOM, React, clocks, browser capabilities
```

Keep the v4 authored JSON schema for this release. Do not preserve runtime aliases such as `setObserved` or `createMotionHost`.

## Phase 0: clean baseline, honest gates, executable evidence

Start from clean `v5`, not PR #145.

1. Record the clean base `v5` at `e4fc9b9` and freeze PR #145 as evidence.
2. Create `v5-break` from `v5`. A release tag for the compatibility snapshot is still pending because the available repository integration can create branches and commits but not tags; do not pretend the branch is a tag.
3. Remove the self-blocking readability allowlist and duplicate readability suites. Keep repository-wide Prettier, architecture boundaries, GSAP isolation, runtime symbol checks, lifecycle, rollback, and full tests.
4. Capture or port only independently verified fixes: destroy re-entrancy, source-edge cleanup before unregister, Track identity preservation, and GraphBinding unsubscribe cleanup.
5. Capture golden behavior for input/output composition, add/remove/replace, mapper-preserving rollback, source destruction, diamond memoization, invalidation/retry, and scheduling state.

**Phase 0 exit gate:** clean branch exists, gate cleanup is committed, baseline evidence is recorded, and the exact-head matrix is green. Phase 1 must not start before this gate.

## Phase 1: one graph authority

Remove compatibility and duplicate ownership together.

1. Delete `LegacyObservationFacade` and its factory installation. Move lifecycle event construction to a neutral module.
2. Remove legacy Track observation methods/getters, ownership modes, `TrackObservationOwner`, `createObservationOwner`, `StandaloneObservationAdapter`, implicit owner adoption, and compatibility mutation hooks.
3. Keep one project-scoped owner backed by one long-lived `ObservationState`.
4. Delete `ObservationStateBridge` and post-commit state recreation. Use an explicit transaction undo journal.
5. Make `GraphBinding` the sole mutation coordinator. Remove topology mutation methods from `GraphPublisher`.
6. Reject cross-owner edges before either scope changes.
7. Migrate tests, types, exports, and demos in the same commits.

Mutation order:

```text
prepare candidate -> resolve -> validate -> apply live state with undo journal
-> apply publisher graph -> commit -> invalidate
```

**Exit gate:** one owner, one live state instance, one mutation API, no legacy runtime surface, no bridge rebuild, rollback and lifecycle tests green.

## Phase 2: qualified project graph and authoritative publication

1. Normalize internal IDs to `motionId/trackId` and `~/trackId`; resolve bare authored IDs locally.
2. Reject ambiguous, duplicate, unknown, malformed, and self-referential IDs. Use canonical qualified-ID ordering.
3. Construct one project-wide GraphRuntime, GraphPublisher, PatchRegistry, and Clock subscription.
4. Mount/unmount Motion membership through ProjectRuntime transactions; remove per-Motion graph ownership.
5. Compose graph-owned Tracks through ObservationState plus Track-local composition, never recursive `Track.compose()` graph walking.
6. Make subscribers consume immutable PatchRegistry batches. Remove `publisherRendering`, `Motion.composeGraph()`, and `applyGraphOrder()` last.

If identity/runtime work is clean but render cutover destabilizes demos, split only this phase into 2a and 2b.

**Exit gate:** cross-motion two-node integration, one flush, one immutable batch, deterministic order, correct unmount invalidation, no half-published state.

## Phase 3: finish domain boundaries

Inject real `Clock`, `Interpolator`, and `Scheduler` ports. Move production GSAP imports behind adapters. Move topology and playback fully from Track to Motion, replace `createMotionHost()`, migrate demos, and complete stable graph-input diagnostics.

**Exit gate:** Track is a leaf, Motion is the sole composite, core tests run with fake ports, and malformed authored rigs fail before mount.

## Phase 4: enable membership and release

Enable cross-motion references and `engine.adopt(track)` free-track membership without flags. Update exports, declarations, README, API docs, examples, demos, package map, and breaking-change migration guidance. Remove migration-only parity machinery and retain one authoritative CI matrix plus documentation integrity checks.

**Exit gate:** full v5 runtime contract, all flags removed, all gates green on one exact head.

## Definition of done

- v4 authored projects still load with `schemaVersion: 4`.
- No compatibility facade or legacy Track observation API exists on any construction path.
- One qualified graph and one long-lived ObservationState per project.
- GraphBinding alone coordinates mutations; GraphPublisher only publishes committed graphs.
- One project-wide runtime/publisher/patch registry/clock.
- Graph-owned Tracks publish immutable batches without recursive graph walking.
- Track is a leaf; Motion owns topology and playback.
- Clock, Interpolator, and Scheduler are real tested ports.
- Cross-motion and free-track membership work without rollout flags.
- Lifecycle teardown is owner-first and idempotent.
- Types, exports, docs, tests, boundaries, benchmarks, and handoff all match the runtime.
