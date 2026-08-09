# MotionPath v5 hard-break implementation plan

**Repo:** `chahyasantoso/motionpath`  
**Reviewed branch:** `feat/pass2-track-facade-removal`  
**Reviewed plan commit:** `1c77071006edef287d9683d9fac869812dad9591`  
**Reviewed PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Date:** 2026-08-10  
**Decision:** make the runtime break now, preserve the v4 authored schema, and deliver the architecture in five vertical phases instead of fourteen horizontal migrations.

## Executive decision

Yes, this can be faster.

The previous plan had the right destination but too many handoffs. It postponed test migration and public API cleanup until the end, separated tightly coupled runtime changes, and treated migration scaffolding as if it deserved product-level phases.

The target remains:

```text
Engine
  owns one ProjectRuntime

ProjectRuntime
  owns one qualified ObservationGraph
  owns one ObservationState
  owns one GraphBinding
  owns one GraphPublisher and PatchRegistry
  owns one Clock subscription

Motion
  owns topology, scheduling, triggers, and playback

Track
  owns playhead state, interpolation, and local plugin composition only

Adapters
  own GSAP, DOM, React, clocks, and browser capabilities
```

Keep the v4 JSON contract (`schemaVersion: 4`) for this release. Break the runtime API deliberately.

## Senior review findings

### 1. PR #145 is not a mergeable foundation

At review time it contains 238 commits, 226 changed files, about 15,000 additions, broad formatting churn, and a failing unit-test job. The boundary, build, typecheck, package, format, and benchmark jobs pass, but a green perimeter does not compensate for a red behavior gate.

Do not keep repairing this PR. Freeze it as evidence, then rebuild the hard break on a clean branch with focused commits.

### 2. The current runtime still has multiple authorities

The code currently has all of these mutation surfaces:

- `GraphBinding` mutates graph state;
- `ObservationState` mutates live edges;
- `GraphPublisher` exposes `addTrack`, `removeTrack`, `addEdge`, and `removeEdge`;
- `ObservationStateBridge` is rebuilt after commits;
- standalone adapters can own a separate graph;
- `Track` can adopt another owner.

That is the root problem. The hard break should establish one command path:

```text
ProjectRuntime API
  -> GraphBinding transaction
       -> candidate ObservationGraph
       -> candidate/live ObservationState mutation
       -> GraphPublisher.applyGraph()
       -> commit or rollback
```

`GraphPublisher` must not expose public graph mutation methods after this cut. It publishes an already committed graph.

### 3. “ObservationState is authoritative” is not yet true

`GraphBinding.#refreshObservationBridge()` destroys and recreates the bridge and state after every commit. That makes state replaceable migration material, not the stable live owner described by the architecture.

Keep one `ObservationState` instance for the lifetime of a loaded project. Transactions mutate it in place with an explicit undo journal. Delete `ObservationStateBridge` once its useful scenarios are captured.

### 4. ProjectRuntime does not yet own the mounted graph

`Engine.#mountMotion()` still creates a `GraphRuntime`, `GraphBinding`, or `GraphPublisher` per Motion. `ProjectRuntime.attachGraphRuntime()` exists, but the main mount path does not use it as the single project owner.

The first meaningful runtime milestone is not another facade cleanup. It is mounting two Motions into one project graph and proving one clock-driven flush.

### 5. Publisher rendering is not authoritative yet

`GraphRuntime.compose()` calls `track.compose()`, and `Track.compose()` delegates back to its observation owner. That keeps recursive Track composition in the publisher path.

The publisher path should compose through `ObservationState` plus the Track's local composer. A graph-owned Track must never recursively walk graph dependencies on its own.

### 6. Lifecycle ownership needs one explicit rule

`Track.destroy()`, `GraphBinding` lifecycle hooks, `ObservationState`, adapters, `Motion.destroy()`, and `ProjectRuntime.dispose()` can all participate in teardown. This is where double destroy and stale edge bugs will hide.

Use this rule:

> The owner removes graph membership and subscriptions first; the contained object releases local resources second. Destruction is idempotent everywhere.

Also, an injected `ProjectRuntime` must not be silently replaced by `Engine.destroy()`. Either the Engine owns and recreates its runtime, or it borrows and only detaches from it.

### 7. Tests must move with behavior

Do not defer test rewriting to a late phase. Every compatibility test should be converted or deleted in the same commit that removes the compatibility behavior. A final “rewrite tests” phase creates a large red zone and slows the work.

## Scope

### In scope

- remove legacy Track observation APIs and `LegacyObservationFacade`;
- remove ownership and publisher rollout flags;
- use one project-scoped `ObservationState` and one mutation coordinator;
- qualify graph IDs internally;
- use one project-wide graph runtime, publisher, patch registry, and clock subscription;
- make published patches authoritative for graph-owned Tracks;
- make `Clock`, `Interpolator`, and `Scheduler` real ports;
- move topology and playback completely to `Motion`;
- enable cross-motion and free-track membership after qualified identity works;
- complete authored graph input validation;
- update tests, types, exports, docs, and demos alongside each break.

### Not in scope

- changing the authored project JSON schema;
- preserving runtime aliases such as `setObserved` or `createMotionHost`;
- supporting two observation ownership implementations;
- preserving the publisher-off rendering path;
- carrying migration-only parity infrastructure into the released package.

## Delivery strategy

Use five phases. A phase is a reviewable vertical capability, not necessarily one commit. Keep each PR under roughly 20 changed source files and exclude repository-wide formatting.

Every phase must leave unit tests, typecheck, build, package, boundary checks, and relevant benchmarks green. No “temporarily red” integration branches.

## Phase 0: clean baseline and executable evidence

Create `v5-break` from the clean `v5` base, not from the full PR #145 diff.

1. Freeze PR #145 and record its final head.
2. Tag the compatibility snapshot `v5-compat-snapshot`. Do not call it `v4.3-final`; it contains v5 migration code, not the v4.3 release.
3. Port only independently verified fixes, each as an isolated commit:
   - destroy re-entrancy and idempotent teardown;
   - source-edge cleanup before unregister;
   - public Track identity preservation;
   - GraphBinding lifecycle unsubscribe cleanup.
4. Capture a compact golden suite:
   - input and output composition;
   - edge add, remove, and replace;
   - failed mutation rollback, including `mapFn`;
   - source destruction and observer cleanup;
   - diamond memoization;
   - paused, seeking, reversed, and nested scheduling.
5. Record patches, order, dependency closure, lifecycle events, and subscription counts. Do not rely only on `old === new` assertions.

**Exit gate:** clean branch, green matrix, reproducible compatibility snapshot, and golden fixtures that can run without the compatibility implementation being imported by production code.

## Phase 1: establish one graph authority

This phase removes compatibility and duplicate ownership together. Splitting them recreates the dual-write state that caused the PR #145 churn.

1. Delete `LegacyObservationFacade` and all legacy Track observation methods and getters.
2. Move destroy-event payload construction to a neutral lifecycle module.
3. Remove:
   - `observationOwnership` modes;
   - `TrackObservationOwner`;
   - `createObservationOwner`;
   - `StandaloneObservationAdapter`;
   - implicit owner adoption;
   - compatibility mutation hooks.
4. Keep one project-scoped owner implementation, backed directly by one long-lived `ObservationState`.
5. Delete `ObservationStateBridge`. Move its useful parity checks into `ObservationState` and transaction tests.
6. Make `GraphBinding` the only mutation coordinator.
7. Remove graph mutation methods from `GraphPublisher`; keep only graph application, invalidation, caching, retry, and publication.
8. Introduce the runtime API:

```js
runtime.addEdge(edge);
runtime.removeEdge(edge);
runtime.replaceEdge(oldEdge, newEdge);
```

9. Reject cross-runtime objects before any mutation.
10. Migrate or delete affected tests, types, exports, and demos in the same commits.

A mutation must follow:

```text
prepare candidate
  -> resolve identities
  -> validate candidate
  -> apply live state with undo journal
  -> apply publisher graph
  -> commit
  -> invalidate
```

A failure must leave graph IR, live edges, publisher cache, lifecycle subscriptions, and Track ownership unchanged.

**Exit gate:** one owner, one live state instance, one mutation API, no legacy symbols, no bridge rebuild, and rollback tests green.

## Phase 2: qualified project graph and authoritative publication

This is the architecture's critical path. Do identity and project-wide ownership in one phase because each is only useful when the other is mounted.

1. Normalize every internal node ID to:

```text
motionId/trackId
~/trackId
```

2. Resolve bare authored IDs inside their Motion during normalization.
3. Reject ambiguous, duplicate, unknown, malformed, and self-referential qualified IDs.
4. Use canonical qualified-ID ordering as the deterministic tie-breaker.
5. Construct exactly one `GraphRuntime` when a project commits.
6. Mount and unmount Motion membership through a ProjectRuntime transaction.
7. Remove per-Motion graph bindings, publishers, graph order, and graph runtime ownership.
8. Start exactly one project clock subscription.
9. Make publisher composition call `ObservationState` with Track-local composition. Do not call recursive graph composition through `Track.compose()`.
10. Make React and DOM subscribers consume immutable `PatchRegistry` batches for graph-owned Tracks.
11. Remove `publisherRendering`, the publisher-off branch, `Motion.composeGraph()`, and `applyGraphOrder()`.

Minimum integration proof:

```text
Motion A source
  -> Motion B observer
  -> one project flush
  -> one immutable batch
  -> unmount A
  -> B invalidated with a stable diagnostic
```

**Exit gate:** one graph runtime, one publisher, one clock subscription, deterministic qualified order, one composition per dirty node per tick, and no half-published batches.

## Phase 3: finish the domain boundary

With the graph stable, finish the object model and external dependencies.

1. Inject `Interpolator` into Track construction.
2. Inject `Scheduler` into Motion.
3. Keep `Clock` at ProjectRuntime/GraphRuntime level.
4. Move all production GSAP imports under adapters.
5. Remove topology and playback from Track:

```text
addChild
removeChild
_attachGroupHost
play
pause
seek
reverse
parent
children
host
```

6. Make `Motion` own recursive children, layout, reflow, scheduling, triggers, playback, and child destruction.
7. Replace `createMotionHost()` with `engine.createMotion(...)`; do not add an alias.
8. Complete plugin input metadata and stable graph diagnostics:

```text
GRAPH_INPUT_MISSING
GRAPH_INPUT_UNKNOWN
GRAPH_INPUT_DUPLICATE
GRAPH_INPUT_ROLE_MISMATCH
GRAPH_SOURCE_INCOMPATIBLE
```

9. Prove core graph and lifecycle tests with fake Clock, Interpolator, and Scheduler and no GSAP import.

**Exit gate:** Track is a leaf, Motion is the sole composite, core tests are renderer-neutral, and malformed authored rigs fail before mount.

## Phase 4: enable membership and release the break

Cross-motion and free Tracks are now small features because qualified identity and the shared runtime already exist.

1. Enable cross-motion references without a capability flag.
2. Make `engine.adopt(track)` register `~/trackId` in the same graph, state, publisher, clock, and lifecycle system.
3. Remove `crossMotion`, `freeTracks`, ownership, and publisher rollout flags.
4. Update public exports, TypeScript declarations, README, API docs, examples, demos, and package export maps.
5. Delete compatibility-only tests, migration status documents, stale allowlists, parity ceremonies, comment-ratio gates, and exact-head process checks.
6. Keep one authoritative CI matrix covering:
   - unit and integration tests;
   - typecheck and build;
   - package dry run;
   - architecture boundaries;
   - lifecycle and rollback;
   - graph benchmarks;
   - documentation integrity.
7. Publish a breaking-change table with old API, replacement, and migration example.

**Exit gate:** cross-motion and adopted free Tracks work end to end, all rollout flags are gone, public surfaces describe only v5 behavior, and the full matrix is green.

## Recommended commit sequence

Keep the phases short, but keep commits surgical:

```text
1. test: capture v5 compatibility golden fixtures
2. fix: port verified lifecycle and identity fixes
3. refactor: remove legacy observation API and ownership modes
4. refactor: make ObservationState and GraphBinding authoritative
5. refactor: qualify project graph identity
6. refactor: mount one project-wide GraphRuntime
7. refactor: make published patches the only graph render path
8. refactor: inject Interpolator and Scheduler ports
9. refactor: make Motion the sole composite
10. feat: finish graph validation and project membership
11. chore: publish v5 API and remove migration machinery
```

Do not mix formatting-only changes into these commits.

## Non-negotiable sequencing rules

- Do not delete `ObservationState`; delete its competitors.
- Do not recreate `ObservationState` after a successful mutation.
- Do not let `GraphPublisher` and `GraphBinding` both mutate graph topology.
- Do not enable cross-motion or free Tracks before qualified IDs and the shared runtime exist.
- Do not make publisher rendering authoritative while it still delegates recursive graph composition to Track.
- Do not remove the last cycle validator until the candidate graph validator is active.
- Do not replace a borrowed/injected ProjectRuntime during `Engine.destroy()`.
- Do not postpone test, type, export, or demo migration to the end.
- Do not merge a PR with a failing unit-test gate.

## Definition of done

- v4 authored projects still load with `schemaVersion: 4`.
- No runtime compatibility facade or legacy Track observation API exists.
- One qualified ObservationGraph and one long-lived ObservationState exist per loaded project.
- GraphBinding is the sole mutation coordinator.
- GraphPublisher cannot mutate topology.
- One project-wide GraphRuntime, PatchRegistry, publisher, and clock subscription exist.
- Graph-owned Tracks publish immutable batches and never recursively compose graph dependencies.
- Track is a leaf; Motion owns topology and playback.
- Clock, Interpolator, and Scheduler are real tested ports.
- Cross-motion and free-track membership work without flags.
- Lifecycle teardown is owner-first, idempotent, and leak-free.
- Tests, types, exports, docs, and demos describe only the v5 runtime contract.
- Unit, integration, typecheck, build, package, boundary, lifecycle, rollback, benchmark, and documentation gates are green.

## Bottom line

The architecture is recoverable, but PR #145 is carrying too much migration history to be the implementation vehicle. Reset the delivery branch, collapse the duplicated ownership model immediately, and drive the rest through one project-wide vertical slice. Five phases are enough; fourteen were protecting scaffolding that the hard break is supposed to delete.