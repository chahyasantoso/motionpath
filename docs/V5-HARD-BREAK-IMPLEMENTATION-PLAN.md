# MotionPath v5 hard-break implementation plan

**Repo:** `chahyasantoso/motionpath`  
**Reviewed branch:** `feat/pass2-track-facade-removal`  
**Reviewed PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145) at head `e1cb33ef`  
**Date:** 2026-08-10 (revision B)  
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

### 1. PR #145 is not mergeable, but it is more reviewable than its raw stats suggest

Revision A of this document called the PR effectively unreviewable at 226 files and roughly 15,000 additions. That framing was wrong and is corrected here.

Those totals are inflated by a repository-wide Prettier pass that landed inside the same branch. The earlier senior review measured the same PR at **49 files, 2,807 additions, 1,053 deletions** before the formatting run. Sampled demo diffs such as `App.jsx`, `BurstPage.jsx`, and `DemoPage.jsx` are pure JSX rewrapping with no semantic change.

Accurate assessment:

- **The diff is reviewable.** Roughly 50 semantic files, readable with whitespace-insensitive diffing.
- **The history is not.** 238 commits containing reverts, re-reverts, repeated "restore readability" passes, and in-diff status documents that describe superseded heads.
- **The head is red.** The unit-test job fails while format, typecheck, build, package, both boundary scans, and both benchmarks pass.

So the reason not to continue in #145 is not size. It is that the branch mixes a compatibility-preserving migration with the hard break that deletes compatibility, and its history can no longer explain which decision is current. Freeze it as evidence and rebuild forward.

### 2. Facade removal has not happened; installation moved up one level

`createTrack.js` still ends with:

```js
return installLegacyObservationFacade(new Track({ ... }));
```

That call is unconditional. `Engine` builds authored-graph Tracks through `createTrack`, so every production Track still receives `setObserved`, `removeObserved`, `replaceObserved`, `observedSources`, `observedEdges`, `observerCount`, and `observerIds`.

The PR title is literally true, because `Track`'s constructor no longer installs the facade, and the strict scanner passes because it only reads `Track.js` source text. The runtime surface is unchanged. Any completion claim based on that scanner is measuring the wrong thing.

### 3. The two ownership modes are the same class

`StandaloneObservationAdapter.js` is a single re-export:

```js
export { ScopedObservationAdapter as StandaloneObservationAdapter } from "./ScopedObservationAdapter.js";
```

So `observationOwnership: "compatibility" | "scoped"`, `OBSERVATION_OWNERSHIP_MODES`, `resolveObservationOwnership()`, the Engine conflict error, the ProjectRuntime validation, the public TypeScript union, and the entire cross-mode parity suite all resolve to one implementation.

The flag cannot roll anything back, and the parity evidence is tautological. Delete the mode, the option, the resolver, the alias, and the parity suite together. This is one of the cheapest large deletions available.

### 4. The current runtime still has multiple mutation authorities

- `GraphBinding` mutates graph state;
- `ObservationState` mutates live edges;
- `GraphPublisher` exposes `addTrack`, `removeTrack`, `addEdge`, and `removeEdge`;
- `ObservationStateBridge` is rebuilt after commits;
- adapters can own a separate graph;
- `Track` can adopt another owner through `_adoptObservationOwner`.

The hard break should establish one command path:

```text
ProjectRuntime API
  -> GraphBinding transaction
       -> candidate ObservationGraph
       -> live ObservationState mutation with undo journal
       -> GraphPublisher.applyGraph()
       -> commit or rollback
```

`GraphPublisher` must not expose graph mutation after this cut. It publishes an already committed graph.

### 5. “ObservationState is authoritative” is not yet true

`GraphBinding.#refreshObservationBridge()` destroys and recreates the bridge and its state after every commit, re-deriving edges from the state it just discarded. That makes live state replaceable migration material rather than the stable owner the architecture describes, and it is why rollback bugs kept reappearing in this branch.

Keep one `ObservationState` per loaded project for its whole lifetime. Mutate in place with an explicit undo journal. Delete `ObservationStateBridge`.

### 6. ProjectRuntime does not yet own the mounted graph

`Engine.#mountMotion()` still constructs a `GraphRuntime`, or a `GraphPublisher` plus `GraphBinding`, per Motion. `ProjectRuntime.attachGraphRuntime()` exists but the mount path never uses it.

The first meaningful runtime milestone is not another facade cleanup. It is mounting two Motions into one project graph and proving one clock-driven flush.

### 7. Publisher rendering is not authoritative yet

`GraphRuntime.compose()` calls `track.compose()`, and `Track.compose()` delegates back to its observation owner. Recursive graph composition therefore still runs inside the publisher path. Compose through `ObservationState` plus the Track-local composer instead; a graph-owned Track must never walk graph dependencies itself.

### 8. The readability gates block the hard break by construction

This is the highest-value process finding and it must be resolved before Phase 1.

`packages/core/src/readability-boundary.test.js` and `packages/core/src/code-style.test.js`, backed by `scripts/v5-readability-allowlist.mjs`, assert line length, statements per line, presence of `/**` blocks, and that the protected list “never shrinks”. The protected list currently includes `usecases/StandaloneObservationAdapter.js` and `usecases/TrackObservationOwner.js`.

Those are exactly two of the files this plan deletes. A gate that forbids shrinking a list of files scheduled for deletion is a gate that fails the moment the work succeeds.

Three further problems:

- The gate protects six files while `Engine.js`, `ProjectRuntime.js`, `Motion.js`, and `GraphRuntime.js` are written as one-line-per-method classes. It enforces a standard the codebase does not follow.
- A large share of #145's commit count is gate appeasement: repeated `style: wrap ...`, `fix: restore Track readability`, and `docs: restore Track invariant comments`. That churn is a direct output of this gate.
- `format:check` now runs Prettier across the whole repository, which already covers line length and statement folding mechanically.

**Action:** in Phase 0, delete the comment-ratio and protected-list assertions, keep Prettier as the mechanical gate, and add a real linter if a semantic rule is genuinely wanted. Documentation quality belongs in review, not in a test that a refactor cannot legally pass.

### 9. Lifecycle ownership needs one explicit rule

`Track.destroy()`, `GraphBinding` hooks, `ObservationState`, adapters, `Motion.destroy()`, and `ProjectRuntime.dispose()` can all participate in teardown. That is where double-destroy and stale-edge bugs hide.

> The owner removes graph membership and subscriptions first; the contained object releases local resources second. Destruction is idempotent everywhere.

Also: `Engine.destroy()` disposes and replaces the ProjectRuntime, including an injected one, preserving only the ownership mode. Either the Engine owns and recreates its runtime, or it borrows and only detaches.

### 10. Tests must move with behavior

Do not defer test rewriting to a late phase. Convert or delete each compatibility test in the same commit that removes the behavior it covers. A terminal “rewrite tests” phase creates a long red zone.

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

Five phases. A phase is a reviewable vertical capability, not necessarily one commit. Keep each PR under roughly 20 semantic files and never mix a formatting pass into a behavior commit.

**Scope tripwire:** if a phase exceeds about 25 commits or acquires a second revert, stop and re-cut it. That tripwire is the single control that #145 lacked.

**Feasibility note:** Phase 2 is the only phase with genuine schedule risk, because it changes identity, ownership, and the render path together. If the identity work lands clean but the render cutover destabilises the React demos, split it:

- **2a** qualified identity plus one project-wide graph runtime, publisher path still selectable;
- **2b** published patches become the only graph render path, then delete `publisherRendering`.

Splitting 2 is acceptable. Splitting 1 is not; separating facade removal from ownership collapse is what produced the dual-write churn in #145.

Every phase must end green on unit tests, typecheck, build, package, boundary checks, and benchmarks.

## Phase 0: clean baseline, honest gates, executable evidence

Create `v5-break` from the clean `v5` base, not from the full PR #145 diff.

1. Freeze PR #145 and record its final head.
2. Tag the compatibility snapshot `v5-compat-snapshot`. Do not call it `v4.3-final`; it contains v5 migration code, not the v4.3 release.
3. **Fix the gates before writing any migration code:**
   - delete the comment-ratio, protected-list, and statements-per-line assertions;
   - keep repository-wide Prettier as the mechanical format gate;
   - keep the architecture and GSAP boundary scans, and make the symbol ban a runtime check over direct, factory, Engine standalone, and Engine authored Tracks rather than a source-text scan of `Track.js`.
4. Port only independently verified fixes, each as an isolated commit. Port the semantics, not the original commits:
   - destroy re-entrancy and idempotent teardown;
   - source-edge cleanup before unregister;
   - public Track identity preservation;
   - GraphBinding lifecycle unsubscribe cleanup.
5. Capture a compact golden suite: input and output composition; edge add, remove, and replace; failed-mutation rollback including `mapFn`; source destruction and observer cleanup; diamond memoization; paused, seeking, reversed, and nested scheduling.
6. Record patches, order, dependency closure, lifecycle events, and subscription counts. Do not rely only on `old === new` assertions.

**Exit gate:** clean branch, green matrix, no gate that a successful deletion would fail, reproducible compatibility snapshot, and golden fixtures that run without production code importing the compatibility implementation.

## Phase 1: establish one graph authority

Remove compatibility and duplicate ownership together. Splitting them recreates the dual-write state that caused the #145 churn.

1. Delete `LegacyObservationFacade`, its unconditional call in `createTrack`, and all legacy Track observation methods and getters.
2. Move destroy-event payload construction to a neutral lifecycle module so `Track` no longer imports the compatibility module.
3. Remove `observationOwnership` and everything that exists only to serve it: `OBSERVATION_OWNERSHIP_MODES`, `resolveObservationOwnership()`, the Engine and ProjectRuntime validation, the TypeScript union, `TrackObservationOwner`, `createObservationOwner`, the `StandaloneObservationAdapter` alias, and the cross-mode parity suite.
4. Remove implicit adoption. `_adoptObservationOwner` goes; cross-owner mutation throws before either side changes.
5. Keep one project-scoped owner backed by one long-lived `ObservationState`.
6. Delete `ObservationStateBridge` and the post-commit rebuild. Move its useful assertions into `ObservationState` and transaction tests.
7. Make `GraphBinding` the only mutation coordinator; strip `addTrack`, `removeTrack`, `addEdge`, and `removeEdge` from `GraphPublisher`.
8. Introduce the runtime API:

```js
runtime.addEdge(edge);
runtime.removeEdge(edge);
runtime.replaceEdge(oldEdge, newEdge);
```

9. Migrate or delete affected tests, types, exports, and demos in the same commits.

Every mutation follows:

```text
prepare candidate
  -> resolve identities
  -> validate candidate
  -> apply live state with undo journal
  -> apply publisher graph
  -> commit
  -> invalidate
```

A failure leaves graph IR, live edges, publisher cache, lifecycle subscriptions, and Track ownership unchanged.

**Exit gate:** one owner, one live state instance, one mutation API, no legacy symbols on any runtime Track surface, no bridge rebuild, rollback tests green.

## Phase 2: qualified project graph and authoritative publication

The critical path. Identity and project-wide ownership belong together because neither is useful alone.

1. Normalize every internal node ID to `motionId/trackId` or `~/trackId`.
2. Resolve bare authored IDs inside their Motion during normalization.
3. Reject ambiguous, duplicate, unknown, malformed, and self-referential qualified IDs.
4. Use canonical qualified-ID ordering as the deterministic tie-breaker instead of declaration index.
5. Construct exactly one `GraphRuntime` when a project commits.
6. Mount and unmount Motion membership through a ProjectRuntime transaction.
7. Remove per-Motion graph bindings, publishers, graph order, and runtime ownership from `Engine` and `Motion`.
8. Start exactly one project clock subscription.
9. Compose through `ObservationState` plus Track-local composition; stop recursing through `Track.compose()` in the publisher path.
10. Make React and DOM subscribers consume immutable `PatchRegistry` batches for graph-owned Tracks.
11. Last: remove `publisherRendering`, the publisher-off branch, `Motion.composeGraph()`, and `applyGraphOrder()`.

Minimum integration proof:

```text
Motion A source
  -> Motion B observer
  -> one project flush
  -> one immutable batch
  -> unmount A
  -> B invalidated with a stable diagnostic
```

**Exit gate:** one graph runtime, one publisher, one clock subscription, deterministic qualified order, one composition per dirty node per tick, no half-published batches.

## Phase 3: finish the domain boundary

1. Inject `Interpolator` into Track construction.
2. Inject `Scheduler` into Motion.
3. Keep `Clock` at the ProjectRuntime and GraphRuntime level.
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
7. Replace `createMotionHost()` with `engine.createMotion(...)` and add no alias. Migrate the Spiral demos and their controllers in the same phase, since both call it directly.
8. Complete plugin input metadata and stable diagnostics:

```text
GRAPH_INPUT_MISSING
GRAPH_INPUT_UNKNOWN
GRAPH_INPUT_DUPLICATE
GRAPH_INPUT_ROLE_MISMATCH
GRAPH_SOURCE_INCOMPATIBLE
```

9. Prove core graph and lifecycle tests with fake Clock, Interpolator, and Scheduler and no GSAP import.

**Exit gate:** Track is a leaf, Motion is the sole composite, core tests are renderer-neutral, malformed authored rigs fail before mount.

## Phase 4: enable membership and release the break

1. Enable cross-motion references without a capability flag.
2. Make `engine.adopt(track)` register `~/trackId` in the same graph, state, publisher, clock, and lifecycle system.
3. Remove `crossMotion` and `freeTracks`.
4. Update public exports, TypeScript declarations, README, API docs, examples, demos, and package export maps. Declare every JS export, including `createObservationScope` and any supported injected runtime option.
5. Delete compatibility-only tests, migration status documents, stale allowlists, parity ceremonies, and exact-head process checks.
6. Keep one authoritative CI matrix: unit and integration, typecheck, build, package dry run, boundary scans, runtime symbol ban, lifecycle and rollback, benchmarks with a deterministic threshold, documentation integrity.
7. Publish a breaking-change table with old API, replacement, and migration example.

**Exit gate:** cross-motion and adopted free Tracks work end to end, no rollout flags remain, public surfaces describe only v5, full matrix green.

## Recommended commit sequence

```text
1. chore: replace readability gates with real format and symbol gates
2. test: capture v5 compatibility golden fixtures
3. fix: port verified lifecycle and identity fixes
4. refactor: remove legacy observation API and ownership modes
5. refactor: make ObservationState and GraphBinding authoritative
6. refactor: qualify project graph identity
7. refactor: mount one project-wide GraphRuntime
8. refactor: make published patches the only graph render path
9. refactor: inject Interpolator and Scheduler ports
10. refactor: make Motion the sole composite
11. feat: finish graph validation and project membership
12. chore: publish v5 API and remove migration machinery
```

No formatting-only changes inside these commits.

## Non-negotiable sequencing rules

- Do not start Phase 1 while a gate forbids deleting the files Phase 1 deletes.
- Do not delete `ObservationState`; delete its competitors.
- Do not recreate `ObservationState` after a successful mutation.
- Do not let `GraphPublisher` and `GraphBinding` both mutate topology.
- Do not keep a rollout flag whose two branches resolve to the same class.
- Do not enable cross-motion or free Tracks before qualified IDs and the shared runtime exist.
- Do not make publisher rendering authoritative while it still delegates recursive composition to Track.
- Do not remove the last cycle validator until the candidate graph validator is active.
- Do not replace a borrowed ProjectRuntime during `Engine.destroy()`.
- Do not postpone test, type, export, or demo migration.
- Do not merge with a failing unit gate, and do not fix a failing gate by editing its expectation.

## Definition of done

- v4 authored projects still load with `schemaVersion: 4`.
- No runtime compatibility facade exists on any Track produced by any construction path.
- One qualified ObservationGraph and one long-lived ObservationState per loaded project.
- GraphBinding is the sole mutation coordinator; GraphPublisher cannot mutate topology.
- One project-wide GraphRuntime, PatchRegistry, publisher, and clock subscription.
- Graph-owned Tracks publish immutable batches and never recursively compose graph dependencies.
- Track is a leaf; Motion owns topology and playback.
- Clock, Interpolator, and Scheduler are real tested ports.
- Cross-motion and free-track membership work without flags.
- Lifecycle teardown is owner-first, idempotent, and leak-free.
- Tests, types, exports, docs, and demos describe only the v5 runtime contract.
- Every gate measures runtime behavior or mechanical formatting, and none of them measures prose.

## Bottom line

The architecture is sound and the break is doable. What failed in #145 was not ambition or diff size; it was three compounding process faults: compatibility and its replacement were kept alive at once, a rollout flag was trusted that pointed at a single class, and a self-referential quality gate turned refactoring into comment maintenance. Fix the gates first, collapse ownership in one deliberate cut, then drive the rest through one project-wide vertical slice.