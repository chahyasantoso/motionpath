# MotionPath v5 hard-break implementation plan

**Repo:** `chahyasantoso/motionpath`  
**Base studied:** `c955297`  
**Branch:** `feat/pass2-track-facade-removal`  
**Date:** 2026-08-09  
**Decision:** remove runtime compatibility while preserving the useful v5 architecture foundation and the v4 authored project schema.

## Executive decision

The optimal solution is a **hard API break, not a hard architecture reset**.

Delete the v4 compatibility projection, but keep and finish the valuable v5 runtime infrastructure:

```text
Engine
  owns one ProjectRuntime

ProjectRuntime
  owns one ObservationGraph       immutable normalized plan
  owns one ObservationState       mutable live wiring
  owns one GraphPublisher
  owns one Clock

Motion
  owns recursive topology,
  scheduling, triggers, and playback

Track
  owns interpolation and plugin composition only

GraphBinding
  owns graph mutations and transactions,
  but never stores a second copy of graph state

Adapters
  own GSAP, DOM, React, clocks, and browser capabilities
```

The key clarification is:

- `ObservationGraph` is the immutable graph IR.
- `ObservationState` is the mutable committed runtime state.
- `GraphBinding` is the transaction coordinator.
- `GraphPublisher` is the flush and cache layer.

Keep that split. It is sound architecture. The original plan simply failed to name both halves.

## Scope and non-goals

### In scope

- Delete legacy v4 runtime APIs and compatibility facades.
- Collapse observation ownership to one implementation.
- Make `ProjectRuntime` the actual project-wide graph owner.
- Make publisher patches authoritative for authored and adopted graph Tracks.
- Finish the three formal ports: `Clock`, `Interpolator`, and `Scheduler`.
- Make `Motion` the sole composite and `Track` a leaf.
- Enable cross-motion and free-track graph membership after their prerequisites pass.
- Rewrite tests around v5 contracts.

### Deliberately not in the first break

- Do not break the v4 authored project JSON schema yet. Keep `schemaVersion: 4`.
- Do not preserve old runtime aliases such as `setObserved` or `createMotionHost`.
- Do not merge half-migrated compatibility states into the main branch.
- Do not enable cross-motion before qualified graph IDs exist.
- Do not delete cycle protection until one authoritative validator is active.

**Principle:** break runtime code, keep authored data.

## Phase 0: freeze behavior and establish rollback

Create a break branch from the current head, but first preserve rollback and behavioral evidence.

1. Tag the current compatibility implementation as `v4.3-final`.
2. Close or freeze PR #145. Do not spend more time perfecting the compatibility slice.
3. Cherry-pick only genuine runtime fixes from PR #145:
   - shared adapter ownership;
   - destroy re-entrancy guard;
   - GraphBinding unsubscribe bug;
   - public Track identity fix.
4. Capture current parity scenarios as golden fixtures:
   - source destruction;
   - observer cleanup;
   - input and output edges;
   - edge replacement;
   - mutual observation;
   - diamond composition;
   - rollback after failed mutation;
   - invalidation and retry;
   - nested composition;
   - paused, seeking, and reversed timelines.
5. Record patch outputs and dependency closure, not only `old === new` assertions.
6. Cut `v5-break` from the captured head if the work is not being performed directly on the active feature branch.

The compatibility implementation becomes a git tag and fixture generator, not a runtime dependency.

**Exit gate:** golden fixtures exist, the base commit is recorded, and the v4.3 tag can reproduce the pre-break behavior.

## Phase 1: remove the compatibility API

Delete the v4 projection first.

Remove:

```text
packages/core/src/usecases/LegacyObservationFacade.js
```

From `createTrack.js`, replace:

```js
return installLegacyObservationFacade(new Track(...));
```

with:

```js
return new Track(...);
```

Remove from `Track`:

```text
_adoptObservationOwner
setObserved
removeObserved
replaceObserved
observedSources
observedEdges
observerCount
observerIds
```

Move lifecycle payload construction into a neutral module such as:

```text
packages/core/src/usecases/observationEvents.js
```

`Track` may ask its injected runtime owner for observer IDs during destruction, but it must not expose graph mutation or legacy observation getters.

New mutation API:

```js
runtime.addEdge(...)
runtime.removeEdge(...)
runtime.replaceEdge(...)
```

No user-facing code mutates observation through `Track`.

### Exit gate

- Authored Engine Tracks have no legacy observation symbols at runtime.
- `createTrack()` does not install properties dynamically.
- No source imports `LegacyObservationFacade`.
- No compatibility names appear in public TypeScript declarations.
- Direct Track tests use the new owner/runtime API.

## Phase 2: collapse ownership to one implementation

Delete the fake ownership rollout.

Remove:

```text
observationOwnership: "compatibility" | "scoped"
OBSERVATION_OWNERSHIP_MODES
resolveObservationOwnership()
TrackObservationOwner
createObservationOwner
StandaloneObservationAdapter
```

Keep one adapter contract, preferably the stronger scoped implementation, and inject it from `ProjectRuntime`.

The key rule:

> A Track never changes observation owners because another Track is passed to it.

Cross-owner mutation must fail before changing either side:

```js
runtimeA.addEdge(trackFromRuntimeB, trackFromRuntimeA);
// throws: cross-runtime observation ownership is not allowed
```

If transfer is ever needed, make it a separate explicit transaction. Do not hide transfer inside `setObserved`.

### Exit gate

- One observation adapter implementation.
- One owner per ProjectRuntime.
- No implicit owner adoption.
- Cross-owner attempts leave both runtimes unchanged.
- Destroying and recreating ProjectRuntime preserves the architecture without mode flags.

## Phase 3: make ObservationState the sole live owner

Do not delete `ObservationState`. Delete its competitors.

### ObservationGraph owns

- normalized nodes;
- immutable edges;
- diagnostics;
- canonical topological order;
- adjacency indexes;
- graph-level identity.

### ObservationState owns

- registered runtime Track instances;
- mutable live edges;
- reverse observer indexes;
- cycle checking;
- invalidation;
- recursive composition state;
- lifecycle cleanup.

### GraphBinding owns only

- prepare;
- validate;
- apply;
- rollback;
- commit;
- subscription coordination.

It must not maintain a second independent graph truth.

Delete `ObservationStateBridge` after golden fixtures are captured. Its parity assertions are migration scaffolding, not product behavior.

Keep `ObservationTrackController` only if it remains a thin mutation port. If it duplicates `ObservationState` logic, delete it and call `ObservationState` through `GraphBinding`.

### Exit gate

Every mutation follows:

```text
prepare -> resolve -> validate -> wire -> commit -> invalidate
```

A failed operation leaves the graph IR, live ObservationState, Track ownership, publisher cache, and lifecycle subscriptions unchanged.

## Phase 4: unify graph identity

The current system has multiple ID models:

```text
local graph IDs:       trackA
project IDs:           motionA/trackA
free-track IDs:        ~/trackA
```

Unify them before enabling project-wide graphs.

Use qualified IDs internally:

```text
motionId/trackId
~/trackId
```

Preserve bare IDs only as an authored-schema convenience. Resolve them during normalization:

```js
{
  source: "parent";
}
```

becomes internally:

```js
{
  source: "motionA/parent",
  target: "motionA/child"
}
```

A qualified source explicitly crosses motion scope:

```js
{
  source: "motionB/parent",
  role: "input",
  target: "parentWorld"
}
```

Add validation for:

- ambiguous bare IDs;
- unknown qualified IDs;
- duplicate qualified IDs;
- invalid free-track namespaces;
- cross-motion references when the capability is disabled;
- self-reference after qualification.

Replace declaration-index tie-breaking with canonical qualified-ID ordering.

### Exit gate

The same graph produces the same order regardless of declaration order, mount order, reload order, mutation history, or motion registration order.

## Phase 5: wire one project-wide GraphRuntime

This is the largest architectural correction.

Currently, `Engine.#mountMotion()` creates a graph runtime per Motion. Change it so:

```text
Engine
  -> ProjectRuntime
       -> one GraphRuntime
            -> one GraphBinding
                 -> one ObservationState
                      -> all mounted tracks
```

Mounting a Motion:

1. Build its Track objects.
2. Qualify their IDs.
3. Register them into the ProjectRuntime candidate.
4. Add their edges to the project graph.
5. Validate the complete candidate.
6. Commit atomically.
7. Let the shared publisher flush them.

Unmounting:

1. Remove the Motion's tracks from the project graph.
2. Remove dependent edges.
3. Invalidate downstream nodes.
4. Unregister instances.
5. Dispose only resources owned by that Motion.

Delete the per-Motion `GraphPublisher` and `GraphBinding` construction path from `Engine`.

`Motion` no longer owns a graph binding or graph order. It owns scheduling only.

### Exit gate

- Exactly one publisher per loaded project.
- Exactly one clock subscription per project.
- `ProjectRuntime.flush()` actually flushes mounted graph nodes.
- Unmounting one Motion invalidates affected nodes in another Motion.
- No graph object is unreachable after mount.
- Destroying Engine tears down the graph exactly once.

## Phase 6: make publisher rendering authoritative

Remove the alternate rendering branch.

Current shape:

```js
if (publisherRendering) {
  GraphRuntime;
} else {
  GraphPublisher + GraphBinding;
}
```

Choose one path and delete the flag. The target path is:

```text
clock tick
  -> GraphPublisher.flush()
  -> PatchRegistry
  -> React / DOM / Canvas adapter
```

`Track.compose()` remains valid only for genuinely standalone Tracks that are not adopted into a ProjectRuntime. Authored and adopted Tracks render from published patches.

Delete:

- `publisherRendering`;
- the publisher-off path;
- `Motion.composeGraph()`;
- `applyGraphOrder()`;
- recursive subscriber composition for graph-owned Tracks.

Keep the one-argument user transform contract only for standalone composition.

### Exit gate

- One composition per dirty graph node per tick.
- Multiple subscribers do not multiply composition work.
- No graph-owned Track recursively composes sources from each subscriber.
- Patch subscribers see complete batches, never half-flushed state.
- Patch revision and immutability tests remain green.

## Phase 7: finish the port boundary

Keep exactly the three formal ports from the original architecture:

```text
Clock
Interpolator
Scheduler
```

Make them real instead of assertion-only seams.

### Clock

Keep the existing strengths:

- manual clock;
- GSAP ticker adapter;
- subscription multiplexing;
- deterministic tick numbers;
- disposal.

### Interpolator

Make Track construction receive an interpolator:

```js
const tween = interpolator.create(vars);
```

GSAP implements the production adapter. Tests use a fake interpolator.

### Scheduler

Make Motion receive a scheduler:

```js
scheduler.to(track, vars);
scheduler.timeline(vars);
```

GSAP implements the production scheduler. Tests use a fake scheduler.

Do not turn every registry, event bus, or helper into a formal port. Those are dependency objects, not architectural boundaries.

### Exit gate

- Core tests run without importing GSAP.
- Production GSAP imports exist only under adapters.
- Fake Clock, Fake Interpolator, and Fake Scheduler cover core lifecycle and graph tests.
- The GSAP quarantine list shrinks to zero.

## Phase 8: move topology and playback completely into Motion

Delete from Track:

```text
addChild
removeChild
_attachGroupHost
play
pause
seek
reverse
groupHost
host
parent
children
```

Motion becomes the only object that mounts children, unmounts children, calculates layout, applies reflow, schedules timelines, owns playback, and recursively destroys child Motions and Tracks.

Replace the old host API with:

```js
engine.createMotion({
  id,
  trigger: {
    type: "manual",
    autoplay,
  },
  staggerTransition,
});
```

Do not preserve `createMotionHost()` as a compatibility alias.

### Exit gate

- Track is a leaf.
- Motion is the sole composite.
- Nested Motion depth-three tests pass.
- Reflow and removal are owned by Motion.
- Repeated initialization does not reuse destroyed delegates.
- Playback controls exist only on Motion.

## Phase 9: complete authored graph validation

Upgrade plugin metadata from:

```js
inputs: ["parentWorld"];
```

to:

```js
inputs: {
  parentWorld: {
    requiredInGraph: true,
    standaloneDefault: {
      x: 0,
      y: 0,
      rotation: 0,
    },
  },
}
```

Validate missing required input, unknown input, duplicate input, role mismatch, incompatible source/output, standalone fallback, and cross-motion qualified source.

Use stable diagnostics:

```text
GRAPH_INPUT_MISSING
GRAPH_INPUT_UNKNOWN
GRAPH_INPUT_DUPLICATE
GRAPH_INPUT_ROLE_MISMATCH
```

The current validator catches some of these. Finish the contract instead of leaving a half-migrated flat `inputs` shape.

### Exit gate

- Malformed authored FK rigs fail before runtime mount.
- Standalone FK tracks use documented defaults.
- Authored graph mode cannot silently fall back to standalone behavior.
- Plugin metadata and TypeScript declarations agree.

## Phase 10: enable capabilities after prerequisites

Once the unified project graph is real, remove the flags and enable the capabilities that were previously gated:

```text
crossMotion: always on
freeTracks: always on
publisherRendering: removed because always on
observationOwnership: removed because only one owner exists
```

Do not enable them before Phases 4 through 9 are complete. Otherwise namespace, lifecycle, and ownership failures become impossible to isolate.

For free Tracks:

```js
engine.adopt(track);
```

registers the Track as:

```text
~/trackId
```

and includes it in the same graph, publisher, clock, and lifecycle system.

### Exit gate

- Cross-motion edges work end to end.
- Free Tracks participate in graph publication.
- Unmount removes references and produces diagnostics.
- Re-adding a source does not silently recreate removed edges.
- Timeline independence is preserved.

## Phase 11: rewrite tests around the new contract

Delete tests whose only purpose is compatibility projection:

```text
Track.v43.test.js
ObservationStateBridge.test.js
ScopedObservationAdapter.parity.test.js
ObservationAdapter.scenario-parity.test.js
Track.owner-first.test.js
createTrack.standalone-adapter.test.js
```

Do not delete their behavior. Rewrite the scenarios against:

```text
graph normalization
graph identity
graph cycle rejection
state mutation
transaction rollback
publisher invalidation
publisher caching
project membership
cross-motion references
free-track adoption
motion topology
track leaf behavior
clock and scheduler ports
plugin input validation
lifecycle disposal
```

The v4.3 tests become golden fixture sources, not active API contracts.

## Phase 12: update public API and schema policy

Break the runtime API deliberately:

- remove legacy Track observation methods;
- remove `createMotionHost`;
- remove ownership mode options;
- remove publisher flags;
- remove compatibility facade imports;
- remove internal graph exports from the public package;
- expose only intended v5 runtime contracts.

Keep the v4 project JSON schema for now:

```text
schemaVersion: 4
```

Update:

- `index.js`;
- `internal.js`;
- TypeScript declarations;
- README;
- API reference;
- demo imports;
- examples;
- package export map.

## Phase 13: remove migration-only process machinery

Delete or simplify:

- exact-head parity ceremony;
- compatibility parity gates;
- runtime symbol-ban tests for APIs that no longer exist;
- comment-ratio gate;
- stale compatibility allowlists;
- migration-only status documents.

Keep unit, typecheck, build, package, boundary, benchmark, lifecycle, rollback, and one authoritative CI matrix.

Add a documentation integrity check so an architecture document cannot be silently replaced again:

```text
- architecture document contains AD-1 through AD-11;
- architecture document contains all implementation phases;
- architecture document contains rollback policy;
- architecture document exceeds a minimum section/content threshold.
```

## Recommended commit order

Use focused commits, but do not merge intermediate compatibility states into the main branch:

```text
1. chore: tag v4.3-final and capture golden graph fixtures
2. refactor: remove legacy observation facade from Track creation
3. refactor: collapse observation ownership to one runtime implementation
4. refactor: formalize ObservationGraph IR and ObservationState runtime ownership
5. fix: unify qualified graph identity and canonical ordering
6. refactor: make ProjectRuntime the single graph owner
7. refactor: make publisher patches the only authored render path
8. refactor: wire Interpolator and Scheduler ports
9. refactor: move topology and playback fully into Motion
10. feat: complete authored plugin input contracts
11. feat: enable cross-motion and free-track graph membership
12. test: rewrite suites around v5 contracts
13. chore: remove compatibility flags and migration gates
14. docs: publish v5 breaking API and architecture status
```

## Critical sequencing rules

Do not start by deleting `ObservationState`; it is the live runtime state needed by the target architecture.

Do not enable cross-motion before qualified IDs exist.

Do not delete cycle checks until one authoritative cycle validator is active.

Do not wire publisher rendering before `GraphBinding` is reachable from the mounted runtime.

Do not pull P2-04 into the same first commit as facade deletion. They belong in the same final architecture, but staging the work keeps failures diagnosable.

The correct sequence is:

```text
freeze behavior
  -> delete compatibility projection
  -> collapse ownership
  -> unify graph identity
  -> wire one project runtime
  -> make publisher authoritative
  -> finish ports
  -> make Motion the sole composite
  -> enable capabilities
  -> rewrite tests
  -> publish breaking API
```

## Definition of done

- Runtime compatibility facade is deleted.
- Track exposes no legacy observation mutation or state API.
- One observation ownership implementation exists.
- ObservationGraph is immutable IR and ObservationState is the sole live wiring store.
- GraphBinding is the only mutation coordinator.
- One project-wide GraphRuntime owns graph publication and clock flushes.
- Graph IDs are qualified internally and ordered canonically.
- Authored rendering consumes immutable publisher patches.
- Track is a leaf and Motion is the sole composite.
- Clock, Interpolator, and Scheduler are real, tested ports.
- Authored plugin inputs are validated with stable diagnostics.
- Cross-motion and free-track behavior work without rollout flags.
- v4 authored schema remains supported.
- Tests assert v5 contracts, not compatibility projections.
- Build, typecheck, package, boundary, benchmark, lifecycle, rollback, and integration gates are green.
- Architecture docs include an integrity check and current-state status.

## Bottom line

Drop compatibility aggressively, but preserve the runtime state and publication architecture. The assets are `ObservationGraph`, `ObservationState`, `GraphBinding`, `GraphPublisher`, `ProjectRuntime`, `PatchRegistry`, and the three formal ports. The waste is the legacy projection, duplicate ownership modes, alternate rendering paths, and migration scaffolding that keeps both systems alive.
