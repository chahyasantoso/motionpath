# MotionPath v5 architecture refactor plan

**Status:** proposal, not yet accepted  
**Revision:** 2026-08-07, integrates `docs/GRAPH-OBSERVATION-AUDIT-2026-08-05.md`  
**Base branch:** `feat/graph-spiral-demo`  
**Scope:** runtime architecture refactor, including the observation graph foundation. This is not a graph feature plan.

## Executive judgment

The original v5 direction was correct but incomplete. The runtime needs fewer, sharper objects, recursive composition, explicit platform ports, and one composition path. The observation audit adds a non-negotiable prerequisite: the graph code is not simply unused code that can be deleted. It currently installs the only live cycle guard, while its publisher and binding are unreachable, retained by track callbacks, and never flushed.

Therefore the graph audit is now a **dependency track inside v5**, not a separate follow-up. Repair graph ownership and lifecycle first, then move graph state out of `Track`, then make the repaired publisher the single render path.

The target is:

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

The core design rules are:

1. A `Track` is a leaf. It samples and composes its own plugin output.
2. A `Motion` is a composite. It schedules `Track` or nested `Motion` children recursively.
3. Topology is a tree. Observation is a DAG. Never merge those models.
4. GSAP is an adapter behind two ports: `Interpolator` and `Scheduler`.
5. The project owns one observation graph and one flush barrier.
6. A subscriber consumes a published patch. It does not recursively compose the graph itself.
7. Mutations are atomic, ownership is explicit, and every runtime object has one disposer.

---

# 1. Bird's-eye architecture

## 1.1 What exists today

MotionPath is a declarative animation runtime. A JSON project is validated and normalized, plugins compile keyframes, GSAP schedules time, tracks compose renderer-neutral patches, and React applies those patches to the DOM.

The layering is good. The object model is not:

- `Track` currently combines interpolation, plugin composition, timeline topology, observation edges, and composite playback.
- `TrackGroup`, `Motion`, and `Engine.createGroupHost()` are three implementations of a composite timeline.
- `Track.compose()` is the only live composition path; `Motion.composeGraph()` has no callers.
- `GraphPublisher` and `GraphBinding` are built during motion mounting with `publish: () => {}`, never flushed, and not attached to the `Motion`. Their lifecycle closures still retain them.
- React recomposes the upstream closure independently for every subscriber and frame.
- GSAP is imported from core domain/use-case modules and raw GSAP tweens leak through the `Track` constructor.

## 1.2 Why this matters

This is not mainly a naming problem. The current structure causes concrete correctness and performance failures:

- A grandchild's parent-relative offset is inserted as an absolute master-timeline offset.
- Removing a subtree can leave descendants scheduled as orphaned tweens.
- Calling `Motion.init()` twice can empty the Motion and reuse a destroyed trigger delegate.
- The graph's live cycle guard exists without a reachable graph mutation API.
- `removeChild()` removes live observation edges without notifying the graph binding or publisher.
- The publisher's cache is unused, while the naive path does repeated recursive composition.
- Two graph sorters can produce different tie-break ordering after mutations.
- A project-wide graph, cross-motion edges, and free tracks are impossible with one graph per Motion.

## 1.3 Target ownership

```text
Engine
  owns project lifecycle, instance ownership, dependencies
  owns one ProjectRuntime

ProjectRuntime
  owns one ObservationGraph
  owns one GraphPublisher
  owns one project clock subscription
  registers mounted Motion and free Track nodes

Motion
  owns one Scheduler and child slots
  owns trigger controls and layout policy
  can contain Track or Motion

Track
  owns one Interpolator and plugin composer
  has no children, host, observation edges, or playback bridge

ObservationGraph
  owns qualified node ids, edges, validation, cycle checks, and topological order

GraphPublisher
  owns dirty state, composed-patch cache, downstream invalidation, retry policy
  publishes once per dirty node per flush

Adapters
  own GSAP, DOM, React bindings, clocks, and browser capability checks
```

---

# 2. Structural findings and their consequences

## 2.1 `Track` is five roles

`packages/core/src/lib/Track.js` currently owns:

| Current role | Current state | v5 owner |
|---|---|---|
| interpolation | raw GSAP tween and proxy state | `Interpolator` adapter + `Track` |
| plugin composition | `compose()` and plugin metadata | `Track` |
| topology | `children`, `parent`, host, offsets, layout | `Motion` |
| observation graph | observed edges, reverse observers, cycle guard | `ObservationGraph` |
| playback handle | group host and play/seek forwarding | `Motion` |

The private-field count is a symptom. The real issue is that unrelated owners need `_`-prefixed escape hatches into the same object.

## 2.2 Composition is flat, not recursive

`Track.addChild()` computes an offset relative to the parent's children. `TrackGroup.mount()` inserts that value directly into the master timeline. Depth one works only because the first host is at zero. At depth two, the parent's offset is lost.

The fix is not merely a shared `Progressable` interface. The scheduler must nest a child scheduler, and offsets must remain parent-relative. Recursive ownership also fixes subtree removal and destroy cleanup.

## 2.3 There are three composites

`TrackGroup`, `Motion`, and `Engine.createGroupHost()` all hold children and expose playback. `Motion` additionally mirrors tracks in `#initialTracks`, `TrackGroup.#tracks`, and `TrackGroup.#proxies`. The duplicated lifecycle creates the `init()`-twice bug.

v5 has exactly one composite: `Motion`. A group host becomes a manual-trigger `Motion`, not a synthetic one-second `Track`.

## 2.4 The graph audit changes the priority

The audit's headline is authoritative:

> There are three composition systems, and the graph subsystem is not one of them.

The live path is `Track.compose()` called by React subscribers. `composeGraph()` has zero callers. `GraphPublisher` and `GraphBinding` are instantiated but not reachable after mount. However, the publisher installs the live graph guard on tracks, so deleting the graph objects now would silently remove cycle protection.

Important audit findings incorporated into this plan:

- `Engine.#mountMotion()` does not call `motion.setGraphBinding(binding)`, so binding teardown never happens.
- `GraphPublisher` and `GraphBinding` can share the same mutable `tracks` Map.
- `GraphPublisher.removeTrack()` is live through destroy hooks and must not be deleted casually.
- `Track.removeChild()` detaches observation edges without graph invalidation.
- `GraphBinding.addTrack()` is not atomic when a later edge fails.
- `replaceObserved()` emits removals but not additions.
- `retry.onExhausted` is validated but ignored.
- Publisher graph nodes and registered tracks are not asserted to be the same set.
- Two topological sort implementations have unstable, different tie-break inputs.
- The intended future is one project graph with cross-motion edges and free tracks, not one graph per Motion.

These are not optional cleanup items. They define the order of the refactor.

---

# 3. Target contracts

## 3.1 Leaf and composite contract

Use a structural contract, not inheritance:

```js
// Progressable: shared public shape only
{ id, duration, progress(value?), getSnapshot(), subscribe(callback) }
```

`Track` and `Motion` may both satisfy this shape, but the contract itself does not solve nesting. `Motion` must own a scheduler that can contain another scheduler.

## 3.2 Interpolator port

```js
interface Interpolator {
  readonly duration: number;
  sample(progress01): Record<string, unknown>;
  dispose(): void;
}
```

`BuildTrackTween` keeps plugin staging, collision checks, and keyframe description generation. `GsapInterpolator` turns that description into a GSAP tween. The domain never reads `_gsap` and never calls `progress()` or `kill()` on a raw tween.

## 3.3 Scheduler port

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

The GSAP adapter drives children explicitly through `onUpdate`, for example `child.progress(proxy.t)`. Do not rely on GSAP's function-valued property setter behavior.

`SchedulerSlot` is an infrastructure handle. It must not become the public-facing `Track` handle.

## 3.4 Project graph contract

The end state is one graph per loaded project:

- Mounted motion tracks use qualified ids such as `motionId/trackId`.
- Free/adopted tracks use a reserved namespace such as `~/trackId`.
- Bare authored references remain motion-local for backward compatibility.
- Qualified references resolve across motions.
- The project graph has one deterministic tie-break key independent of mount order.
- Partial mounting has an explicit policy: either staged unresolved nodes are allowed and reported, or all referenced nodes must be present before commit. The default recommendation is staged registration with commit-time validation before a flush.

Before implementing cross-motion edges, settle these policies:

1. When a source Motion unmounts, does a dependent edge auto-remove, become invalid, or block unmount? Recommendation: auto-remove with a diagnostic and downstream invalidation.
2. If two independent Motion timelines are at different progress values, what does a cross-motion observer see? Recommendation: sample each source at its current progress during the shared flush; the project clock orders composition, it does not synchronize timelines.
3. What is the deterministic order for independent nodes? Recommendation: qualified id, not mount order.

---

# 4. Phased execution plan

Each phase is one PR unless stated. Do not combine structural phases. Every phase starts with tests and ends with an explicit exit gate.

## Phase 0: characterization and guardrails

**Why:** timing and lifecycle behavior must be measured before changing it.

**Do:**

- Add a red grandchild-offset regression test.
- Add a red subtree-orphan test.
- Add a red `Motion.init()`-twice test.
- Add a 60-frame compose-count baseline with 3-depth and 10 subscribers.
- Add mount/unmount churn and retained-object checks.
- Extend the core boundary test to forbid GSAP imports outside adapters.
- Record test count, build result, bundle size, and package contents.

**Exit:** tests document current failures; no runtime behavior changes.

## Phase 1: repair graph lifecycle before touching architecture

**Why:** the graph audit proves the current graph is partly live. Deleting it would remove cycle protection and create worse failures.

**Do:**

1. Attach the binding on the success path with `motion.setGraphBinding(binding)`, or, if the project-runtime migration begins immediately, attach it to `ProjectRuntime`. Never leave it in a local variable.
2. Give the graph owner one explicit disposer and test destruction after successful mount, failed mount, and reload.
3. Copy `tracks` defensively in both publisher construction and `applyGraph`.
4. Assert graph node ids and track ids are equal in both directions.
5. Keep `GraphPublisher.removeTrack()` until destroy ownership is rewritten; do not apply the old blanket deletion recommendation.
6. Stop the publisher's destroy hook from mutating binding-owned membership. Membership changes go through the graph owner.
7. Make `GraphBinding.addTrack()` atomic: resolve all sources, validate all edges, wire, commit, and subscribe as one transaction; unwind and destroy on failure.
8. Route edge removal from `removeChild()` through graph invalidation, or make topology removal call the graph owner explicitly.
9. Emit edge additions during `replaceObserved()`.
10. Either implement `retry.onExhausted: retain` or remove the option. Prefer removing it unless a caller needs retain semantics.
11. Replace duplicated publisher mutation paths with the graph owner's transaction API, but preserve the live destroy path until its replacement is tested.
12. Use one topological sorter and one deterministic tie-break policy.

**Exit:** no unreachable binding, no shared mutable ownership, no silent graph/live-track divergence in lifecycle tests.

## Phase 2: establish the project graph boundary

**Why:** cross-motion edges and free tracks are an architectural direction, not a later optimization. The object model must not hard-code one graph per Motion.

**Do:**

- Introduce `ProjectRuntime` owned by `Engine`.
- Move `GraphPublisher` and `GraphBinding` ownership from `Motion` to `ProjectRuntime`.
- Register mounted Motion children and adopted/free tracks through one API.
- Add qualified node-id resolution and validator diagnostics.
- Define staged mounting behavior and source-unmount semantics.
- Keep graph mutations atomic across all motions.
- Add tests for same-motion edges, cross-motion edges, free tracks, source removal, and duplicate qualified ids.
- Keep `Motion` unaware of graph topology except for publication/subscription integration.

**Exit:** one graph per loaded project, one owner for graph membership, and no graph object retained only through callback closure.

## Phase 3: collapse to one composite

**Why:** ports and recursion must be designed against one client shape, not three composites.

**Do:**

- Merge `TrackGroup` behavior into `Motion`.
- Delete `#initialTracks`, `#tracks`, and `#proxies` mirroring in favor of one ordered child collection with opaque scheduler slots.
- Build the scheduler in the constructor; delete `init()`.
- Delete `Engine.createGroupHost()` and replace it with `createMotion({ trigger: { type: "manual" } })`.
- Delete `Track` playback forwarding, group host state, mount state, and topology methods.
- Consolidate trigger delegates around one control implementation plus trigger-specific configuration.
- Define `unmount()` as detach and `destroy()` as ownership disposal. Both are idempotent.
- Migrate Spiral, TowerDefense, Walker, and all tests.

**Exit:** only `Motion` schedules children; no `TrackGroup`, group-host bridge, or two-phase init remains.

## Phase 4: introduce ports and fake-backed tests

**Why:** the current Flutter/Canvas portability claim is false while raw GSAP objects leak into Track and domain modules.

**Do:**

- Add `ports/Interpolator.js` and `ports/Scheduler.js`.
- Move GSAP timeline/tween construction into `adapters/gsap/`.
- Move the ticker clock into the GSAP adapter directory.
- Make `BuildTrackTween` return a platform-neutral keyframe description.
- Make Track depend on `Interpolator`, not a raw tween.
- Make Motion depend on `Scheduler`, not a raw timeline.
- Make the GSAP scheduler call `child.progress()` explicitly.
- Run Track and Motion tests against fake ports without loading GSAP.
- Empty the boundary-test allow-list.

**Exit:** no GSAP imports outside adapters; fake-backed core tests pass; snapshots contain no GSAP implementation details.

## Phase 5: make composition genuinely recursive

**Why:** this is where the grandchild bug is fixed. A shared interface alone is insufficient.

**Hard gate before coding:** run an isolated nested-GSAP spike proving that a child scheduler can be nested, reflowed, sought, and disposed at depth three. Do not infer this from documentation.

**Do:**

- Make `Motion` satisfy `Progressable`.
- Allow `Motion.add(child)` for either Track or nested Motion.
- Keep layout offsets parent-relative.
- Put every child on its parent's scheduler, never directly on an ancestor scheduler.
- Make subtree removal recursively dispose scheduler slots and descendants.
- Ensure destroy without an explicit remove cannot leave a scheduled child.
- Keep `GaplessLayoutDelegate` unchanged unless characterization proves it wrong; its current responsibility is correct.

**Exit:** arbitrary-depth nesting passes; grandchild offset and orphan tests are green; no Track has parent/children/host fields.

## Phase 6: move observation state out of Track

**Why:** topology and data-flow are different graphs. Once topology leaves Track, observation state must leave too.

**Do:**

- Introduce `ObservationGraph` as the sole owner of edges, reverse indexes, cycle validation, and topological order.
- Make `Track.compose(input)` compose only its own plugin output. It does not walk upstream edges.
- Move `setObserved`, `removeObserved`, and `replaceObserved` semantics into graph transactions.
- Preserve `GraphBinding`'s atomic mutation behavior, but make it the graph runtime API rather than a coordinator between duplicated live state and IR.
- Remove `_setGraphGuard`, `_addObserver`, `_removeObserver`, and live observed maps from Track.
- Run cycle validation once per graph mutation and once during normalization, with one implementation and stable diagnostics.

**Exit:** Track is a leaf with no topology or observation API; graph tests pass through ObservationGraph; cycle rejection has one owner.

## Phase 7: make publishing the only composition path

**Why:** the audit confirms that `composeGraph()` is unused and React recomposes per subscriber. The publisher cache only pays off when it is the single path.

**Do:**

- Delete `Motion.composeGraph()`, `TrackGroup.composeGraph()`, `applyGraphOrder()`, and `#graphOrder`; do not repair an API with zero callers.
- Give ProjectRuntime one publisher and one clock/tick integration.
- Flush once per clock tick in project topological order.
- Publish patches through a per-node subscription registry.
- Make React subscribe to published patches rather than call `track.compose()`.
- Keep standalone tracks supported through a direct local composition path when they are not adopted into a ProjectRuntime.
- Remove `Overlay`; represent entrance/exit layering with the graph mechanism or a clearly separate renderer concern, not two equivalent runtime APIs.
- Define error behavior: successful nodes publish, failed nodes retain retry state, downstream nodes are blocked only when their inputs are unavailable.

**Exit:** exactly one production compose call site, one flush barrier, shared composition for shared sources, and dirty state drains after each flush.

## Phase 8: extract assembly and simplify Engine

**Why:** `Engine` currently hides graph ownership and motion assembly, which is how the dropped binding escaped review.

**Do:**

- Extract `assembleMotion` and `assembleProjectRuntime` use cases.
- Keep Engine responsible for dependencies, project load/reload, instance ownership, and public lookup.
- Replace linear duck-typed `getTrack()` scanning with typed registries for tracks, motions, and free objects.
- Make load failure-atomic and dispose the old ProjectRuntime only after the candidate is ready.
- Test partial assembly failure, reload, foreign unmount, duplicate ids, and repeated destroy.

**Exit:** Engine is a lifecycle façade, not a runtime assembler; no graph object is created inside a method scope and lost.

## Phase 9: public API, docs, and adapters

**Why:** the current barrel exports internals while omitting the public object model, forcing deep imports.

**Do:**

- Export Engine, Motion, Track, public contracts, and supported adapters from the package root.
- Hide GraphPublisher internals, normalization helpers, and use cases behind package exports.
- Block deep imports into `lib/` and `usecases/` with an exports map.
- Update `ARCHITECTURE.md`, the observation audit, graph guides, API reference, and demo docs.
- Add ADRs for recursive composition, two ports, one project graph, one publisher path, and Overlay removal.

**Exit:** a clean consumer fixture imports only public APIs; docs describe the actual runtime rather than planned-but-unused methods.

## Phase 10: optional tween collapse

**Why last:** after the publisher and compose path are fixed, tween count may not be the bottleneck. This change also depends on unverified GSAP re-parenting and reflow behavior.

**Gate:** isolated repro, benchmark at demo scale, and a measured win in CPU or memory. No number, no PR.

---

# 5. Sequencing summary

```text
0  Characterize behavior and tighten boundaries
1  Repair graph lifecycle and ownership seams
2  Establish one project graph and cross-motion policy
3  Collapse TrackGroup / Motion / group-host into one Motion
4  Add Interpolator and Scheduler ports
5  Make scheduler composition recursive
6  Move observation state into ObservationGraph
7  Make GraphPublisher the single compose/publish path
8  Extract assembly and reduce Engine
9  Fix public exports and documentation
10 Optional tween collapse, measurement-gated
```

The important dependency changes from the previous v5 plan are:

- Graph lifecycle repair is now before structural graph extraction.
- Project-wide graph ownership is explicit before moving graph state out of Track.
- `composeGraph()` is deleted, not revived, because the audit found zero callers.
- `GraphPublisher.removeTrack()` is retained until destroy ownership is deliberately rewritten.
- The project graph is not postponed until after the render path; cross-motion and free-track semantics are settled before the publisher becomes global.
- Recursive composition still requires the GSAP nesting spike. This remains a hard gate.

---

# 6. Explicit non-goals

- Do not eliminate standalone tracks. They are a real product category.
- Do not make `SchedulerSlot` the public handle.
- Do not use inheritance between Track and Motion.
- Do not merge the topology tree with the observation DAG.
- Do not build speculative Flutter, CSS, or WebGL adapters. Fake ports are enough to prove the seam.
- Do not migrate to TypeScript during this structural refactor.
- Do not rewrite `GaplessLayoutDelegate` without a failing characterization test.
- Do not optimize topological sorting or tween count before project-scale benchmarks.
- Do not delete graph construction merely because its publisher is currently unwired; the cycle guard is live.

---

# 7. Definition of done

- `Track` is a leaf with interpolation and local plugin composition only.
- `Motion` is the sole composite and supports arbitrary-depth nesting.
- Grandchild offsets are parent-relative and tested.
- Subtree removal and destroy are recursive and leak-free.
- The project has one graph, one membership owner, one deterministic topological order, and explicit cross-motion/free-track semantics.
- Graph mutations are atomic, and graph/live runtime state cannot silently diverge.
- No GSAP import exists outside adapters; fake-backed core tests pass.
- One publisher flush composes each dirty node once and serves all subscribers.
- React does not recursively compose graph sources per subscriber.
- `Overlay` and `composeGraph()` are either deleted or have an explicitly documented, independently justified role. The default plan deletes both.
- Engine owns lifecycle, not assembly internals.
- Public package exports represent the actual object model.
- Spiral, TowerDefense, Walker, and existing renderer behavior remain visually unchanged.
- Every phase has a test, an exit gate, and a measured regression/benchmark where timing or performance changed.

---

# Appendix: evidence index

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
| Cross-motion/free-track target is documented | `docs/GRAPH-OBSERVATION-AUDIT-2026-08-05.md`, section 6 |
| Public barrel omits core object model | `packages/core/src/index.js` |

## Related documents

- `docs/GRAPH-OBSERVATION-AUDIT-2026-08-05.md`: verified graph findings, corrections to earlier recommendations, and project-wide graph direction.
- `docs/ARCHITECTURE.md`: current package ownership and graph architecture baseline.
- `docs/REFACTOR-PLAN-v4.1.md`: historical package-boundary and lifecycle plan.
- `docs/V4.3-GRAPH-CORRECTNESS-PLAN.md`: graph correctness acceptance criteria to preserve while relocating ownership.
