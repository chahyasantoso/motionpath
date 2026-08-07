# MotionPath v5 architecture refactor plan

**Status:** proposal, not yet accepted  
**Revision:** 2026-08-07, senior architecture pass  
**Base branch:** `feat/graph-spiral-demo`  
**Scope:** runtime architecture refactor, including the observation graph foundation. This is not a graph feature plan.

## Executive decision

The target architecture is directionally right, but the original sequencing is too aggressive. We should **not introduce a project-wide graph, recursive Motion composition, and a new publisher path in the same migration step**. That is three independent sources of semantic change with no safe rollback boundary.

The recommended strategy is a **strangler migration**:

1. Characterize and repair the currently live lifecycle seams.
2. Introduce explicit runtime ownership and ports without changing public behavior.
3. Migrate the existing same-motion graph to one real publisher path behind a compatibility boundary.
4. Collapse the three composite implementations into `Motion`.
5. Make nested scheduling recursive and prove it with an isolated adapter spike.
6. Only then enable a project-wide graph, cross-motion edges, and free tracks behind an explicit capability/feature flag.

This preserves the important conclusion from the graph audit: the graph code is not harmless dead code. It currently installs the only live cycle guard, while its publisher and binding are unreachable, retained by track callbacks, and never flushed.

The target end state remains:

```text
Project schema
  -> validate + normalize
  -> compile tracks into interpolators
  -> assemble recursive Motions
  -> one project ObservationGraph
  -> one topological Publisher flush per clock tick
  -> renderer-neutral patches
  -> React / DOM / Canvas / Flutter adapters
```

## Non-negotiable design rules

1. `Track` is a leaf. It samples and composes only its own plugin output.
2. `Motion` is the sole composite. It schedules `Track` or nested `Motion` children recursively.
3. Topology is a tree. Observation is a DAG. Never merge those models.
4. GSAP is an adapter behind `Interpolator`, `Scheduler`, and `Clock` ports.
5. There is one graph owner per runtime scope. The migration starts motion-scoped and ends project-scoped.
6. A subscriber consumes a published patch. It does not recursively compose the graph itself.
7. Mutations are atomic, ownership is explicit, and every runtime object has one idempotent disposer.
8. Compatibility behavior must live at a boundary, not in `Track` or `Motion` forever.
9. Every semantic migration has a kill switch and a measured exit gate.

## Architecture decisions

### AD-1: Use a staged graph scope

The final scope is one graph per loaded project, but the first publisher migration is same-motion only. Add a `GraphRuntime` abstraction with a scope-aware registry so the implementation can move from `MotionRuntime` to `ProjectRuntime` without changing graph mutation semantics.

- `MotionRuntime`: temporary compatibility scope for the migration.
- `ProjectRuntime`: final scope, owning all mounted motions and adopted/free tracks.
- No code outside the runtime should know which scope is active.

Cross-motion edges and free tracks are **not enabled** until the project scope has passed the clock, unmount, rollback, and performance gates.

### AD-2: Use one composed patch contract

Define a renderer-neutral patch envelope before wiring React to the publisher:

```js
{
  nodeId,
  revision,
  values,
  sourceProgress,
  status: "ready" | "blocked" | "error",
}
```

Patches are immutable for subscribers. A revision changes only when the node's effective output changes. Subscribers must never observe a half-flushed graph.

### AD-3: Make clock ownership explicit

Add a `Clock` port. A publisher flush is scheduled once per runtime clock tick, not opportunistically from an individual track callback. The clock defines ordering only; it does not synchronize independently controlled Motion timelines.

For the final project graph, each source is sampled at its current progress during the shared flush. This behavior must be documented and tested for paused, seeking, reversed, and independently mounted motions.

### AD-4: Transaction boundaries are first-class

Graph mutations, motion mount, motion unmount, project reload, and publisher flush each have explicit transaction boundaries. A failed operation must leave the previous committed runtime usable.

The minimum rule is: **prepare, validate, wire, commit, publish invalidation**. Never mutate live edges or shared membership maps while still resolving later inputs.

### AD-5: Public API follows ownership, not implementation

Do not expose `GraphPublisher`, `GraphBinding`, `SchedulerSlot`, raw GSAP objects, or graph internals from the package root. Expose public `Engine`, `Motion`, `Track`, runtime handles, and supported adapter contracts only.

## Target ownership

```text
Engine
  owns project lifecycle, instance ownership, dependencies
  owns one ProjectRuntime

ProjectRuntime
  owns one ObservationGraph, GraphPublisher, Clock
  owns graph membership and qualified node ids
  owns mounted Motion and adopted/free Track registration

Motion
  owns one Scheduler and child slots
  owns trigger controls and layout policy
  can contain Track or Motion

Track
  owns one Interpolator and plugin composer
  has no children, host, observation edges, or playback bridge

ObservationGraph
  owns qualified node ids, edges, validation, cycle checks, topological order

GraphPublisher
  owns dirty state, composed-patch cache, downstream invalidation, retry policy
  publishes once per dirty node per flush

Adapters
  own GSAP, DOM, React, clocks, and browser capability checks
```

## Current findings that drive the order

- `Track` currently combines interpolation, plugin composition, topology, observation edges, and playback.
- `TrackGroup`, `Motion`, and `Engine.createGroupHost()` are three composite implementations.
- `Track.compose()` is the only live composition path; `composeGraph()` has no callers.
- `GraphPublisher` and `GraphBinding` are constructed during mount but not attached to the Motion, never flushed, and retained through track callbacks.
- The graph guard is live and must not disappear during cleanup.
- `removeChild()` can remove live observation edges without graph invalidation.
- `GraphPublisher` and `GraphBinding` can share a mutable `tracks` Map.
- `GraphBinding.addTrack()` is not atomic on failure.
- `replaceObserved()` emits removals but not additions.
- Retry `onExhausted` is validated but ignored.
- Two topological sort paths can produce different tie-break ordering.
- The current public barrel exports internals and omits the intended public object model.

## Contracts

### Progressable

Use a structural contract, not inheritance:

```js
{ id, duration, progress(value?), getSnapshot(), subscribe(callback) }
```

Both `Track` and `Motion` may satisfy it. The contract alone does not solve nesting; `Motion` still needs a scheduler capable of containing another scheduler.

### Interpolator

```js
interface Interpolator {
  readonly duration: number;
  sample(progress01): Record<string, unknown>;
  dispose(): void;
}
```

`BuildTrackTween` owns plugin staging, collision checks, and keyframe description generation. `GsapInterpolator` turns that description into GSAP behavior. Core code never reads `_gsap` or calls `progress()`/`kill()` on a raw tween.

### Scheduler

```js
interface Scheduler {
  readonly duration: number;
  add(child, atSeconds): SchedulerSlot;
  remove(slot): void;
  move(slot, atSeconds, transition): void;
  seek(progress01): void;
  play(): void;
  pause(): void;
  reverse(): void;
  onTick(callback): unsubscribe;
  dispose(): void;
}
```

The GSAP adapter must drive children explicitly through `child.progress(proxy.t)`. Do not rely on function-valued property setter behavior.

### Clock

```js
interface Clock {
  subscribe(callback): unsubscribe;
  start(): void;
  stop(): void;
  now(): number;
}
```

The clock must be injectable in tests. The production adapter may use `gsap.ticker`; core tests must use a deterministic fake clock.

## Phased execution plan

Each phase is one PR unless stated. Every phase starts with tests and ends with an explicit exit gate. No phase may silently change the migration flag's default behavior.

### Phase 0: characterization, observability, and guardrails

**Do:**

- Add red tests for grandchild offsets, orphaned subtree removal, and `Motion.init()` twice.
- Add mount/unmount churn and retained-object checks.
- Add a 60-frame baseline with 3-depth nesting, 10 subscribers, and the Spiral demo scale.
- Record compose calls per node, flush duration, dropped-frame count, heap-retained objects, test count, build result, bundle size, and package contents.
- Add a core boundary test forbidding GSAP imports outside adapters.
- Add a feature-flag test proving old and new paths can be selected deterministically.
- Add a test fixture for paused, reversed, seeking, and independently mounted motions.

**Exit:** current failures are documented; no runtime behavior changes; baseline artifacts are committed.

### Phase 1: repair graph lifecycle without changing composition

**Do:**

1. Attach the binding on the success path, or move it immediately to the runtime owner. Never leave it in a method-local variable.
2. Give the graph owner one explicit idempotent disposer and test successful mount, failed mount, reload, unmount, and repeated destroy.
3. Copy `tracks` defensively in publisher construction and `applyGraph`.
4. Assert graph node ids and registered track ids are equal in both directions.
5. Keep `GraphPublisher.removeTrack()` until destroy ownership is rewritten and tested.
6. Stop publisher hooks from mutating binding-owned membership. Membership changes go through the graph owner.
7. Make `GraphBinding.addTrack()` atomic: resolve all sources, validate all edges, wire, commit, subscribe, and unwind on failure.
8. Route `removeChild()` edge teardown through graph invalidation, or make topology removal call the graph owner explicitly.
9. Emit edge additions during `replaceObserved()`.
10. Delete ignored `retry.onExhausted` semantics or implement them. Prefer deletion until a real caller needs retain behavior.
11. Use one topological sorter with one deterministic tie-break key.

**Exit:** no unreachable binding, no shared mutable ownership, no silent graph/live-track divergence, and cycle protection remains active.

### Phase 2: introduce runtime scope and compatibility boundaries

**Do:**

- Introduce `GraphRuntime` with `register`, `unregister`, `replaceEdges`, `flush`, and `dispose`.
- Start with one `MotionRuntime` per mounted Motion, but hide that scope behind the same interface intended for `ProjectRuntime`.
- Move publisher/binding ownership out of `Motion` implementation details and into the runtime owner.
- Add a deterministic fake Clock and patch registry.
- Define patch revision, blocked-node, error, and retry behavior.
- Add a runtime kill switch that keeps the current recursive subscriber path as fallback.
- Make mount and unmount prepare a candidate membership set, validate it, then commit atomically.

**Exit:** the graph is addressable through one runtime API, the old path still passes, and the new runtime can be constructed and disposed without leaks.

### Phase 3: wire one publisher path for same-motion graphs

**Do:**

- Run one publisher flush per injected Clock tick.
- Make React subscribe to published patches when the migration flag is enabled.
- Keep standalone tracks on their direct local composition path.
- Preserve the one-argument `compose` callback supplied to user `transformFn`s for compatibility.
- Publish successful nodes in topological order; retain retry state for failed nodes; block downstream nodes only when inputs are unavailable.
- Ensure subscribers never receive partial flush state.
- Add shadow mode that computes both old and new patches, compares them, and reports mismatches without switching rendering.

**Exit:** same-motion graphs compose each dirty node once per tick, shared sources are composed once, old/new outputs match in shadow mode, and the fallback can be restored with one flag.

### Phase 4: collapse to one composite

**Do:**

- Merge `TrackGroup` behavior into `Motion`.
- Replace mirrored `#initialTracks`, `#tracks`, and `#proxies` with one ordered child collection plus opaque scheduler slots.
- Build the scheduler in the constructor; delete `init()`.
- Replace `Engine.createGroupHost()` with `createMotion({ trigger: { type: "manual" } })`.
- Delete Track playback forwarding, group-host state, mount state, and topology methods.
- Define `unmount()` as detach and `destroy()` as ownership disposal. Both are idempotent.
- Migrate Spiral, TowerDefense, Walker, and all tests.

**Exit:** only Motion schedules children; no TrackGroup, group-host bridge, or two-phase initialization remains.

### Phase 5: introduce ports and fake-backed tests

**Do:**

- Add `Interpolator`, `Scheduler`, and `Clock` ports.
- Move GSAP timeline/tween construction and ticker integration into `adapters/gsap/`.
- Make Track depend on Interpolator and Motion depend on Scheduler.
- Run Track, Motion, and publisher tests without loading GSAP.
- Empty the boundary-test allow-list.

**Exit:** no GSAP import exists outside adapters; fake-backed core tests pass; snapshots contain no GSAP details.

### Phase 6: make composition genuinely recursive

**Hard gate before coding:** run an isolated nested-GSAP spike proving a child scheduler can be nested, reflowed, sought, reversed, and disposed at depth three. Do not infer this from documentation.

**Do:**

- Make Motion satisfy Progressable.
- Allow Motion.add(child) for either Track or nested Motion.
- Keep layout offsets parent-relative.
- Put every child on its immediate parent's scheduler, never directly on an ancestor scheduler.
- Make subtree removal recursively dispose scheduler slots and descendants.
- Ensure destroy without explicit remove cannot leave a scheduled child.

**Exit:** arbitrary-depth nesting passes; grandchild offset and orphan tests are green; no Track has parent/children/host fields.

### Phase 7: move observation state out of Track

**Do:**

- Introduce ObservationGraph as sole owner of edges, reverse indexes, cycle validation, and topological order.
- Make Track.compose(input) compose only its own plugin output.
- Move setObserved, removeObserved, and replaceObserved semantics into graph transactions.
- Remove graph guards and live observed maps from Track only after the runtime graph owns cycle validation in all enabled paths.
- Preserve standalone-track behavior explicitly: unaffiliated tracks may use local composition; adopted tracks use runtime graph validation.

**Exit:** Track is a leaf; graph tests run through ObservationGraph; cycle rejection has one owner; compatibility mode still has equivalent protection.

### Phase 8: promote to ProjectRuntime

**Prerequisite:** Phases 1-7 pass all correctness and performance gates in same-motion mode.

**Do:**

- Introduce one ProjectRuntime per loaded project with one graph, publisher, clock, and membership owner.
- Add qualified ids such as `motionId/trackId` and a reserved namespace for free tracks such as `~/trackId`.
- Keep bare authored references motion-local for backward compatibility.
- Add `adopt(track)` for free tracks.
- Define staged mounting: register candidates, validate the complete candidate graph, then commit; no partial graph becomes renderable.
- Define source unmount semantics: dependent edges are auto-removed with a diagnostic and downstream invalidation. They do not silently resolve to null.
- Define independent timeline semantics: each source is sampled at its current progress during the shared flush.
- Use qualified id as the deterministic tie-break key, never mount order.
- Add tests for cross-motion edges, free tracks, duplicate ids, source removal, partial mount failure, reload, and foreign unmount.

**Exit:** one graph per loaded project, one membership owner, one flush barrier, and no cross-motion behavior enabled without explicit capability selection.

### Phase 9: simplify Engine and public API

**Do:**

- Extract `assembleMotion` and `assembleProjectRuntime` use cases.
- Keep Engine responsible for dependencies, project load/reload, instance ownership, and public lookup.
- Replace duck-typed scanning with typed registries for motions, tracks, and free objects.
- Make reload failure-atomic: prepare the candidate ProjectRuntime, validate it, then swap and dispose the old runtime.
- Export Engine, Motion, Track, public contracts, and supported adapters from the package root.
- Hide GraphPublisher internals, normalization helpers, and use cases behind package exports.
- Block deep imports into `lib/` and `usecases/` with an exports map.

**Exit:** Engine is a lifecycle facade, not a runtime assembler; consumers use public APIs only; old runtime is still usable if candidate assembly fails.

### Phase 10: measurement-gated optimization

Only optimize after the publisher path is real and the project graph is enabled.

**Required evidence before merging an optimization:**

- p50 and p95 flush time at baseline and demo scale.
- compose count per node per clock tick.
- retained objects after repeated mount/unmount/reload churn.
- dropped frames during spawn, pop, reflow, and cross-motion updates.
- bundle-size and package-content diff.
- visual output comparison against the compatibility path.

Optional tween collapse, heap-based topological sorting, and downstream-index optimization are separate PRs. No benchmark, no optimization PR.

## Explicit policies to lock before ProjectRuntime

1. **Source removal:** auto-remove dependent edges, emit a diagnostic, invalidate downstream nodes.
2. **Timeline independence:** sample every source at its current progress during the shared flush.
3. **Ordering:** sort independent nodes by qualified id.
4. **Partial mounting:** staged registration is allowed, but a candidate graph must validate before it can flush.
5. **Failure isolation:** successful nodes publish; failed nodes retain retry state; dependent nodes are blocked only when required inputs are unavailable.
6. **Mutation atomicity:** failed add, remove, replace, mount, unmount, and reload leave the last committed runtime intact.
7. **Standalone tracks:** remain supported, but they are outside ProjectRuntime and do not receive project-wide cycle validation until adopted.

## Definition of done

- `Track` is a leaf with interpolation and local plugin composition only.
- `Motion` is the sole composite and supports arbitrary-depth nesting.
- Grandchild offsets are parent-relative and tested.
- Subtree removal and destroy are recursive and leak-free.
- The project has one graph, one membership owner, one deterministic topological order, and explicit cross-motion/free-track semantics.
- Graph mutations are atomic, and graph/live runtime state cannot silently diverge.
- No GSAP import exists outside adapters; fake-backed core tests pass.
- One publisher flush composes each dirty node once and serves all subscribers.
- React does not recursively compose graph sources per subscriber when the publisher path is enabled.
- `Overlay` and `composeGraph()` are deleted unless an independently justified role survives review.
- Engine owns lifecycle, not assembly internals.
- Public package exports represent the actual object model.
- Spiral, TowerDefense, Walker, and existing renderer behavior remain visually unchanged.
- Every phase has tests, an exit gate, a rollback path, and measured regression/performance evidence where timing or performance changes.

## Rollback strategy

Every migration phase must be reversible without reverting unrelated commits:

- Keep the compatibility composer until shadow mode proves output equivalence.
- Gate publisher rendering, ProjectRuntime, and cross-motion edges independently.
- On mismatch, disable the narrowest flag, preserve diagnostics, and continue using the last known-good path.
- Never remove cycle protection as part of a rollback.
- Never dispose the old runtime until the replacement has mounted, validated, and produced its first successful flush.

## Appendix: evidence index

| Finding | Evidence |
|---|---|
| Track combines five roles | `packages/core/src/lib/Track.js` |
| Relative child offsets become absolute master positions | `Track.addChild()` -> `TrackGroup.mount()` |
| Three composite implementations | `Motion.js`, `TrackGroup`, `Engine.createGroupHost()` |
| Live composition bypasses graph publisher | `packages/react/src/hooks/useMotionSubscribers.js` |
| `composeGraph()` has no callers | repository-wide search, confirmed in observation audit |
| Publisher is constructed with no-op publish and never flushed | `Engine.#mountMotion()` |
| Binding is not attached to Motion | `Engine.#mountMotion()` omits `motion.setGraphBinding(binding)` |
| Graph objects remain retained through callbacks | `GraphPublisher.#attachHooks()` and `GraphBinding.#subscribeTrack()` |
| Removal can desynchronize graph IR and live edges | `Track.removeChild()` and `GraphBinding` lifecycle handling |
| Binding add is not atomic | `GraphBinding.addTrack()` |
| Shared mutable map ownership | `GraphPublisher` constructor/applyGraph and `GraphBinding.#syncPublisher()` |
| Retry option is ignored | `GraphPublisher.#normalizeRetry()` and `#recordPublishFailure()` |
| Topological tie-breakers differ | `normalizeObservationGraph.js` and `GraphPublisher` mutation paths |
| Public barrel omits core object model | `packages/core/src/index.js` |

## Related documents

- `docs/GRAPH-OBSERVATION-AUDIT-2026-08-05.md`: verified graph findings and lifecycle corrections.
- `docs/ARCHITECTURE.md`: current package ownership and graph architecture baseline.
- `docs/REFACTOR-PLAN-v4.1.md`: historical package-boundary and lifecycle plan.
- `docs/V4.3-GRAPH-CORRECTNESS-PLAN.md`: graph correctness acceptance criteria to preserve while relocating ownership.
