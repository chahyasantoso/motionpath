# Observation graph audit — verification pass + new findings

**Repo/branch:** `chahyasantoso/motionpath`, `feat/graph-spiral-demo`
**Date:** 2026-08-05 (revised same day — see §0 revision note)
**Scope read in full:** `usecases/GraphPublisher.js`, `usecases/GraphBinding.js`,
`usecases/normalizeObservationGraph.js`, `usecases/Spawner.js`, `lib/Track.js`, `lib/Motion.js`,
`engines/Engine.js`, `src/index.js`, `react/src/hooks/useMotionSubscribers.js`,
`docs/GRAPH-SPIRAL-DEMO-PLAN.md`.
**Method:** every claim below is checked against the source on this branch. Prior findings are
labelled Confirmed / Confirmed-but-misprioritized / Partly wrong. New findings are #16–#27.

---

## 0. Headline: there are three composition systems, and the graph subsystem isn't one of them

> **Revision note.** The first version of this section claimed the live render path was
> `TrackGroup.composeGraph()`. **That was wrong.** `composeGraph` has **zero callers anywhere in
> the codebase** — it appears only in its own definitions in `Motion.js` and in four docs
> (`ARCHITECTURE.md`, `RIG-GRAPH-GUIDE.md`, `API-REFERENCE.md`, `V4.3-GRAPH-CORRECTNESS-PLAN.md`),
> all of which describe it as the composition path. It isn't. Corrected below, and Step 1 is
> rewritten accordingly.

The repo contains three separate composition mechanisms:

**1. `Track.compose()`'s own per-call recursion — the only one that is live.**
Per `useMotionSubscribers.js`:

```js
return targetTrack.subscribe((raw) => {
  const compose = (data) => targetTrack.compose(data); // one argument — fresh ctx every call
  const patch =
    typeof transformFn === "function"
      ? transformFn(raw, compose)
      : compose(raw);
  onPatch(applyAnchor(patch, getAnchor()));
});
```

Rendering is push-based and per-subscriber: a track's own tween ticks → `Track.progress()` →
`#notify()` → each subscriber calls `track.compose(raw)`. `compose()` then walks its own
`#observed` map for both `role:"input"` and `role:"output"` edges, recursing into sources through
a `ctx` `Map` it allocates itself, guarded by the `COMPOSING` sentinel. **This is why Walker's FK
rig works today with none of the graph machinery attached.** The dependency graph is resolved
implicitly, per subscriber, per frame, from scratch.

**2. `Motion.composeGraph()` / `TrackGroup.composeGraph()` — built, called by nothing.**
Along with `Motion.applyGraphOrder` and `TrackGroup.applyGraphOrder`, which are also never called.
The `#graphOrder` plumbed from `#mountMotion` into `Motion` into `TrackGroup` terminates in a
method no one invokes.

**3. `GraphPublisher` / `GraphBinding` — built on every mount, attached to nothing.**
`publish` is `() => {}`. Nothing calls `flush()`. And per **#27** below, neither object is
reachable from outside `#mountMotion` after it returns.

So the situation is worse than "the optimized path isn't wired up." The two documented graph paths
are both inert, and the live path is the naive one that predates them. Every `GraphPublisher`
caching/scheduling finding (#7, #8, #12, #21, #22) is **latent**, and the prior review's Tier 4
recommendation — benchmark the O(n²) topological sort — targets code that does not execute during
rendering. The real per-frame cost today is N subscribers × full recursive recompose, with no
sharing between subscribers of a common source.

---

## 1. Verdict on findings #6–#15

| #   | Verdict                                                   | Note                                                                                                                                                         |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | **Confirmed**                                             | `input: edge.role === "input" ? edge.target : undefined` — verbatim, still there.                                                                            |
| 7   | **Confirmed**                                             | `#markDownstream` does `upstream.includes(sourceId)` inside a full `#upstream` scan. Latent (§0).                                                            |
| 8   | **Confirmed**                                             | `throw new AggregateError(...)` is the last statement after all publishes and cache writes.                                                                  |
| 9   | **Confirmed**                                             | `#graphGuard` BFS walks live `observedEdges`. And per §0/#27 it is the _only_ part of the graph layer with a live effect today.                              |
| 10  | **Confirmed, and worse**                                  | Not merely "callable directly with mismatched inputs" — it becomes reachable in production the moment fix #13 is applied. See **#18**.                       |
| 11  | **Confirmed**                                             | `addEdge`/`addTrack`/`removeEdge`/`removeTrack` all route through `buildTopologicalOrder`, which checks only unknown refs + cycles.                          |
| 12  | **Confirmed as code, misprioritized**                     | The `findIndex`+`splice` O(n²) pattern is duplicated in both sorters exactly as described. Not on any executing path today — but see §6, which changes this. |
| 13  | **Confirmed as description, recommendation is dangerous** | The redundancy is real. Deleting `onSourceDestroyed` breaks the graph. See **#18**.                                                                          |
| 14  | **Partly wrong**                                          | See below.                                                                                                                                                   |
| 15  | **Confirmed as a no-op, recommendation is wrong**         | See below.                                                                                                                                                   |
| —   | Mount-time pre-wiring split                               | **Confirmed.** And see **#16**, **#27**.                                                                                                                     |
| —   | Per-motion graph scoping                                  | **Confirmed**, but understated: the binding of a mounted motion isn't merely motion-scoped, it's unreachable. See **#27** and §6.                            |

### #14 is overstated on the destroy path

The claim is that a dependent "keeps serving its last cached patch indefinitely" when a source is
destroyed. On the destroy path that is not what happens. `GraphBinding.removeTrack` → `#commit` →
`applyGraph`, and `applyGraph` contains:

```js
for (const [key, edge] of previousEdgeKeys)
  if (!nextEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
```

Every edge that disappears seeds **its target** — i.e. exactly the dependents in question — which
then get `#cache.delete` + `#marked.add` plus a `#markDownstream` sweep. The destroy path is covered.

The underlying mechanism (`#removeObservedKey` emits only `"edge-removed"`, and `#attachHooks`
listens only for `"invalidated"`/`"destroyed"`) is real. It just bites somewhere else — see **#19**.

### #15's proposed fix should be deletion, not implementation

Confirmed that `Track.replaceObserved` passes `{ role, input, ignoring }` and `#graphGuard` is
`(observer, source) => {...}`, so all three are discarded. But the recommendation — "the guard
signature needs to accept and honor `{ role, input, ignoring }`, walking the live-edge BFS while
skipping any edge whose key is in `ignoring`" — cannot change any outcome. Proof:

- The BFS visits `{source} ∪ ancestors(source)`, following `current.observedEdges[].source` upward.
- It throws the instant `current === observer`.
- `ignoring` holds keys of **observer's own** observed edges.
- Observer's edges are only traversed after observer is dequeued — and dequeuing observer throws
  before the traversal line is reached.

Therefore no edge in `ignoring` is ever walked, and honoring it is provably a no-op. The correct
fix is to **delete the third argument at the call site**, not to implement it. Same for `{ role, input }`:
the guard is a pure reachability check and has no use for them.

---

## 2. New findings

### #16 — `GraphPublisher` and `GraphBinding` share one mutable `tracks` Map. (High — root cause)

`GraphPublisher` never copies defensively, in either place it accepts tracks:

```js
// constructor
this.#tracks = tracks instanceof Map ? tracks : new Map(tracks);
// applyGraph
const nextTracks = tracks instanceof Map ? tracks : new Map(tracks);
```

`GraphBinding` does copy on the way in (`new Map(tracks)`), but then hands its own private map
straight back out on every commit:

```js
#syncPublisher() { this.#publisher.applyGraph(this.#graph, this.#tracks); }
```

After the first `#syncPublisher()` — which runs in `GraphBinding`'s constructor — `publisher.#tracks`
**is** `binding.#tracks`, the same object. `GraphPublisher.removeTrack` then does
`this.#tracks.delete(id)`, silently mutating `GraphBinding`'s private state behind its back.

This is the enabling condition for #17, #18 and #22. Fix: `new Map(tracks)` unconditionally in both
places. One line each, no behavior change on any correct path.

### #17 — `GraphPublisher.removeTrack` is not dead code. The prior "delete all four" fix would break destroy. (High — correction)

Tier 1 claims `addEdge`/`addTrack`/`removeEdge`/`removeTrack` are "dead code outside their own unit
tests." Three of them are. `removeTrack` is not — `GraphPublisher` calls it on itself:

```js
// #attachHooks
track.onLifecycle?.((event) => {
  if (event.type === "invalidated") this.markDirty(id);
  if (event.type === "destroyed") this.removeTrack(id);
});
```

Delete it and every track destroy throws a `TypeError` from inside `Track.#emitLifecycle`, which
propagates out of `Track.destroy()` **before** `#destroySubscribers.clear()`,
`#lifecycleSubscribers.clear()`, the group-host teardown, and `#interpolationTimeline.kill()` — so
you also leak a GSAP timeline per destroyed track. Deleting the other three plus
`buildTopologicalOrder` is correct and safe (`buildTopologicalOrder` is not exported from
`src/index.js`); `removeTrack` must be kept or its hook rewritten in the same change.

### #18 — Deleting `onSourceDestroyed` (Tier 2, #13) permanently desyncs `GraphBinding`. (High — correction, most important item here)

`Track.destroy()` fires the two channels in a fixed order:

```js
for (const callback of [...this.#destroySubscribers]) callback(event); // onSourceDestroyed — first
this.#emitLifecycle({ type: "destroyed", track: this, observerIds }); // onLifecycle — second
```

And within `onLifecycle`, insertion order decides. `GraphPublisher` subscribes in its own
constructor and re-subscribes during `applyGraph`; `GraphBinding` subscribes in `#subscribe()`,
which runs **after** `#syncPublisher()`. So:

- **Today:** `onSourceDestroyed` fires first → `GraphBinding.removeTrack` runs the full, correct
  teardown (candidate graph → `#commit` → `applyGraph`). The publisher's own handler is a no-op
  afterwards because `applyGraph` already detached and reattached hooks.
- **After deleting `onSourceDestroyed`:** `GraphPublisher`'s handler wins → `removeTrack` deletes
  the id from the **shared** map (#16) → `GraphBinding`'s handler then hits
  `if (this.#destroyed || !this.#tracks.has(id)) return` and **bails out**.

Result: `binding.#graph` keeps a ghost node and its edges forever. `#assertTrackGraphMatches` only
runs in the constructor, so nothing detects the drift. The next mutation rebuilds the candidate
graph from the stale IR and hands `applyGraph` a node with no registered track — which is **exactly
finding #10**, now live in production rather than hypothetical.

`onSourceDestroyed` is not redundant. It is load-bearing by accident. Fix the ordering explicitly
(single destroy channel, binding tears down first, publisher never touches the shared map) and
_then_ delete it.

### #19 — `Track.removeChild()` strips observation edges and tells nobody. (High)

This is the live case the prior #14 was reaching for.

```js
removeChild(id) {
  ...
  child.#detachObservationEdges(); // → observer.#removeObservedKey(key) on every dependent
  ...
}
```

The child is **not destroyed**, so no `"destroyed"` event fires, so `GraphBinding.removeTrack` never
runs, so `applyGraph` never runs, so the edge-diff invalidation in §1 never happens. Two silent
failures at once:

1. **IR divergence.** Live `Track` wiring loses the edge; `binding.#graph` still declares it. The
   next `#candidateGraph` call rebuilds from the stale IR and re-derives an edge that no longer
   exists in live state. `#assertTrackGraphMatches` runs only at construction and won't catch it.
2. **Stale composition.** `#removeObservedKey` emits only `"edge-removed"`, which `#attachHooks`
   ignores, so the dependent is never marked dirty.

**Directly relevant to the spiral demo:** pop-and-reflow must call
`GraphBinding.removeTrack`/`replaceEdge` explicitly. `removeChild`'s automatic teardown prevents a
dangling reference but does _not_ keep the graph honest. State this as a hard requirement.

### #20 — `replaceObserved` emits removals but never announces additions. (Medium)

`setObserved` emits `"edge-added"`/`"edge-replaced"`. `replaceObserved` calls `#removeObservedKey`
for each replaced edge (N × `"edge-removed"`), writes the additions directly into `#observed`, and
emits only a final `#invalidate("observation")`. Any listener doing edge bookkeeping off lifecycle
events sees a rewire as a pure deletion. Nothing consumes those events today, which is precisely
why the inconsistency has gone unnoticed — and why a graph-visualization overlay for the demo would
render wrong.

### #21 — `retry.onExhausted` is validated, stored, and never read. (Low — dead config)

`#normalizeRetry` throws unless the value is `"retain"` or `"drop"`, then puts it on `#retry`. No
other line in the file reads it. `#recordPublishFailure` unconditionally does
`else this.#publishPending.delete(id)` — hardcoded `"drop"`. A caller passing
`onExhausted: "retain"` gets drop semantics, silently. Wire it or delete the option; validating an
input you then ignore is worse than not accepting it.

### #22 — A registered-but-ungraphed track permanently disables the `flush()` fast path. (Medium)

`#isWarm()` iterates `this.#tracks`; the compose loop iterates `this.#order`. A track in the map but
absent from `graph.nodes` never composes → never enters `#cache` → `#isWarm()` returns `false`
forever → the `marked.size === 0 && publishPending.size === 0` early return never fires and every
flush pays a full pass. This is the mirror image of #10 and wants the same fix: assert in
`applyGraph` that graph node ids and `tracks` keys are the **same set in both directions**, not just
one.

### #23 — The two topological sorts tie-break on different indices and can disagree. (Low)

`normalizeObservationGraph` tie-breaks on the track's **declaration index**. `buildTopologicalOrder`
tie-breaks on the position in the `nodes` array it was handed — and `GraphPublisher.addEdge`/
`removeEdge` build that array from `this.#order`, i.e. the _previous sort's output_. So the tie-break
key drifts on every mutation, and the same logical graph yields different valid orders depending on
which path produced it. Non-reproducible ordering for independent nodes. One more argument for
keeping exactly one sorter (see #17).

### #24 — `GraphBinding.addTrack` is not atomic despite the `try/catch`. (Medium)

```js
try {
  for (const edge of observes) { ...; track.setObserved(source, ...); }
  this.#commit(candidate);
  this.#subscribeTrack(track);
} catch (error) { this.#tracks.delete(track.id); throw error; }
```

If the third of five edges throws (unknown source, or the cycle guard fires), edges one and two are
already wired into live `Track` state, and their source tracks hold `_addObserver` back-references
to a track that has just been dropped from the binding. Nothing unwinds them; the new track is never
destroyed. `Track.replaceObserved` carries an explicit _"Atomic pop-and-rewire"_ comment — `addTrack`
should hold the same bar: resolve and validate **all** sources first, then wire, and on failure
unwire what was applied and destroy the track.

### #25 — `Engine.#mountMotion` never calls `motion.setGraphBinding(binding)`. (High)

`Motion` already has the API:

```js
setGraphBinding(binding) { ... }
get graphBinding() { return this.#binding; }
destroy() { ...; this.#binding?.destroy(); ... }
```

`#mountMotion` never calls it. Consequences on the **success** path: `motion.graphBinding` is always
`null`, and `Motion.destroy()`'s `this.#binding?.destroy()` is a no-op, so the binding's
subscriptions are never torn down. One line fixes both. See #27 for the full consequence.

### #26 — `TrackGroup.#graphOrder` is frozen at mount; runtime-added tracks are never composed. (High, but see §0)

`#graphOrder` is set once from `graph.order` at mount. `Track.addChild` → `host._mountChild` →
`TrackGroup.mount` adds the child to `#tracks` but **not** to `#graphOrder`.
`Motion.applyGraphOrder` and `TrackGroup.applyGraphOrder` exist to fix this and are never called;
`GraphBinding` has no channel to notify a motion that its order changed.

**Downgraded in practice** by the §0 correction: since `composeGraph()` itself has no callers, a
stale `#graphOrder` currently harms nothing. It becomes a real bug the instant anything calls
`composeGraph()`. Treat it as a trap laid for whoever wires option A(2) in §4, not as a live defect.

### #27 — `binding` and `publisher` are unreachable after mount, but _not_ collected — they leak and stay partly active. (High)

In `#mountMotion`, `let binding;` is assigned inside the `try` and read only in the `catch`
(`binding?.destroy()`). `publisher` is a `const` local held only by `binding`. Neither is stored on
`motion`, returned, or registered. So **no caller can ever reach a validated mutation surface for a
mounted motion** — `binding.replaceEdge()` for Zuma-style pop-and-rewire is not merely inconvenient,
it is structurally impossible through the engine, which is why the demo has to build its own
publisher and binding per ball and walk straight into the mount-time pre-wiring trap.

One refinement on "they get garbage collected": **they don't.** Both are retained by strong
references held by the tracks:

```js
// GraphPublisher.#attachHooks
track._setGraphGuard?.(this.#graphGuard);          // class-field arrow, closes over the publisher
track.onLifecycle?.((event) => { ... this.removeTrack(id) ... });
// GraphBinding.#subscribeTrack
track.onLifecycle?.((event) => { ... this.removeTrack(event.track.id) ... });
track.onSourceDestroyed?.((event) => { ... });
```

Every track holds the publisher's guard and both objects' lifecycle closures; `Motion` holds the
tracks; the engine holds the motion. So the graph layer is alive, subscribed, and reacting to every
track invalidation and destroy — while being addressable by nobody. That is worse than a leak,
because one part of it has a real live effect: **`#graphGuard` is installed on every mounted track,
so cross-track cycle prevention on `setObserved` is the single thing the graph subsystem actually
does in production today.** Any plan that stops constructing the publisher (option B) silently
removes cycle protection from every mounted track. Note this before choosing.

---

## 3. Corrected summary table

| #   | Finding                                                                                   | Location                    | Severity                | Live today?              |
| --- | ----------------------------------------------------------------------------------------- | --------------------------- | ----------------------- | ------------------------ |
| 0   | Three composition systems; the live one is the naive per-subscriber recursion             | whole graph layer           | **High**                | Yes                      |
| 27  | Binding/publisher unreachable after mount, retained by track closures, guard still active | `Engine`                    | **High**                | Yes                      |
| 25  | Engine never calls `motion.setGraphBinding` — binding never destroyed                     | `Engine`                    | High                    | Yes                      |
| 19  | `removeChild` strips edges without notifying the binding or publisher                     | `Track`                     | High                    | Yes                      |
| 16  | Publisher and binding share one mutable `tracks` Map                                      | `GraphPublisher`            | High                    | Yes (latent)             |
| 18  | Deleting `onSourceDestroyed` desyncs the binding permanently                              | `Track`/`GraphBinding`      | High                    | On applying prior fix    |
| 17  | `removeTrack` is not dead code; prior fix breaks destroy + leaks a timeline               | `GraphPublisher`            | High                    | On applying prior fix    |
| 6   | `addEdge` loses the `input` slot name                                                     | `GraphPublisher`            | High                    | No                       |
| 10  | `applyGraph` silently accepts nodes with no track                                         | `GraphPublisher`            | High                    | Only via #18             |
| 11  | Publisher's own mutation API skips schema validation                                      | `GraphPublisher`            | High                    | No                       |
| 26  | `#graphOrder` frozen at mount                                                             | `Motion`/`TrackGroup`       | Medium                  | No (composeGraph unused) |
| 24  | `GraphBinding.addTrack` leaves partial wiring on failure                                  | `GraphBinding`              | Medium                  | Yes                      |
| 22  | Ungraphed registered track permanently disables the flush fast path                       | `GraphPublisher`            | Medium                  | Latent                   |
| 20  | `replaceObserved` emits no `edge-added` event                                             | `Track`                     | Medium                  | Yes                      |
| 14  | Auto edge cleanup skips invalidation                                                      | `Track`                     | Medium                  | Only via #19             |
| 15  | `replaceObserved`'s `ignoring` arg is discarded (and unnecessary)                         | `Track`                     | Low                     | Yes, harmless            |
| 12  | O(n²) topological tie-break on every mutation                                             | `normalizeObservationGraph` | Low → **High under §6** | Latent                   |
| 7   | O(n²) downstream propagation                                                              | `GraphPublisher`            | Low → **High under §6** | Latent                   |
| 8   | `AggregateError` thrown after side effects                                                | `GraphPublisher`            | Low                     | Latent                   |
| 21  | `retry.onExhausted` validated then ignored                                                | `GraphPublisher`            | Low                     | Yes                      |
| 23  | Two sorters tie-break on different indices                                                | both                        | Low                     | Yes                      |
| 13  | `onSourceDestroyed` redundant, payload unused                                             | `Track`                     | Low                     | Yes                      |
| 9   | `#graphGuard` "redundant" — actually the only live graph behavior                         | `GraphPublisher`            | Low                     | Yes                      |

---

## 4. Proposed solution, sequenced

### Step 0 — Decide what `GraphPublisher` is for (blocks everything else)

The §6 target (project-wide graph, cross-motion edges, free tracks) **forces option A**. Recorded
here for completeness:

- **(A) Wire it in.** A real `publish`, and something ticking `flush()`. The only version where
  #7/#8/#12/#21/#22 are worth work — and the only version compatible with §6.
- **(B) Don't.** Stop constructing it. Note that per #27 this also removes the cycle guard from
  every mounted track, so B is strictly "delete a feature," not "delete dead code."
- **(C) Both, unwired.** The status quo. This is what produced #25, #26 and #27.

**Decision: (A).** Under A there is a second choice the previous revision of this doc got wrong,
because it assumed `composeGraph()` was live:

> **What does `flush()` actually replace?**
>
> - **A(1) — replace the per-subscriber `.compose()` call.** `useMotionSubscribers` stops calling
>   `track.compose(raw)` and instead reads the patch the publisher already computed for that track
>   this frame. `flush()` runs once per `gsap.ticker` tick, before the render callbacks, and
>   `publish(id, patch)` feeds a per-track patch registry the hook subscribes to. This is the real
>   win: today N subscribers of a shared source each recompose the whole upstream chain
>   independently; after this, each track composes once per frame, in topological order, and only
>   when dirty. It is also the only option compatible with cross-motion edges (§6), which need a
>   single ordered barrier across motions that per-subscriber recursion cannot provide.
> - **A(2) — make `composeGraph()` delegate to the publisher, then find it a caller.** This is what
>   `V4.3-GRAPH-CORRECTNESS-PLAN.md` describes ("its `composeGraph()` delegates to the binding or
>   publisher"). Cheaper, but it leaves the per-subscriber path in place as a fourth way to compose,
>   and `TrackGroup` is motion-scoped so it cannot host a project graph.
>
> **Recommendation: A(1). Delete `composeGraph`/`applyGraphOrder` rather than fixing #26.**
> Note the invariant this must preserve: `Track.compose()` currently allocates its own `ctx` when
> called with one argument, and `useMotionSubscribers` passes `compose` into user `transformFn`s as
> a one-arg callable. Any A(1) change has to keep that signature working for standalone tracks that
> are in no graph at all.

### Step 1 — Reconnect the graph layer (unblocks the demo, prerequisite for §6)

1. `#mountMotion`: `motion.setGraphBinding(binding)`. Minimum viable fix for #25/#27 — makes the
   binding reachable and destroyed. Do this today even if §6 lands later; it is the one line
   standing between the demo and its "GraphBinding owns every runtime edge mutation" criterion.
2. Give `GraphBinding` an `onCommit(graph)` callback so order changes can propagate out.
3. Under A(1): add the tick integration — `flush()` on `gsap.ticker` ahead of the render callbacks,
   a real `publish` writing into a patch registry, and a subscription path for
   `useMotionSubscribers` to read from it.
4. `GraphBinding.addTrack` becomes the only supported way to add a runtime node, and must reach
   `TrackGroup.mount`. Spawned children that participate in the graph go through the binding, not
   through `Track.addChild` alone.

### Step 2 — Close the ownership seams (small, mechanical, no design tradeoffs)

5. `new Map(tracks)` unconditionally in `GraphPublisher`'s constructor and `applyGraph`. (#16)
6. Bidirectional set assertion in `applyGraph`: every graph node has a track **and** every track has
   a graph node, else throw. Fixes #10 and #22 in one guard.
7. Make `GraphPublisher`'s `"destroyed"` hook stop mutating the tracks map: clear only its own
   scheduling state and leave membership to `applyGraph`. This is the real fix behind #17/#18 —
   after it, destroy ordering stops mattering and `onSourceDestroyed` can be deleted safely (#13).
8. Delete `addEdge`, `addTrack`, `removeEdge`, `buildTopologicalOrder`. Keep `removeTrack`
   (rewritten per 7). Kills #6, #11, #23, and one of the two O(n²) copies from #12. (#17)
9. Drop the third argument from the `#graphGuard` call in `replaceObserved`. Do **not** implement
   it. (#15)
10. Delete `retry.onExhausted`, or implement `"retain"`. (#21)

### Step 3 — Fix the removal paths (correctness)

11. Route `removeChild`'s edge teardown through an invalidation the publisher hears — have
    `#removeObservedKey` fire `#invalidate("observation")` on the observer, or have
    `#detachObservationEdges` invalidate each affected dependent once at the end. (#19, #14)
12. Make `GraphBinding.addTrack` genuinely atomic. (#24)
13. Emit `"edge-added"` from `replaceObserved` for each addition, matching `setObserved`. (#20)

### Step 4 — Structural changes

14. **Move wiring into `GraphBinding`** (static factory wiring `setObserved` from `graph.edges`), so
    `Engine.#wireObservations` disappears and `#assertTrackGraphMatches` becomes unnecessary.
15. **`flush()` contract.** One-line doc comment: always applies successful patches, throws only to
    report. No `flushSafe()` until a caller needs it. (#8)
16. **Delete `composeGraph` / `applyGraphOrder` / `Motion.#graphOrder`** under A(1), rather than
    fixing #26. Update the four docs in §0 that describe `composeGraph()` as the composition path.

### Step 5 — Measure, then optimize

17. Benchmark after Step 1 lands, at demo scale (30-ball waves, spawn + pop + reflow), measuring
    `flush()` and `normalizeObservationGraph` separately. **Under §6 this stops being optional:** a
    project-wide graph makes n the count of every track in the project, not per motion, which is
    where #7 and #12 actually start to hurt. #7's inverted `#downstream` map is cheap enough to ride
    along with Step 2; #12's heap-based Kahn's rewrite should still wait for a number.

---

## 5. Note on the demo branch state

`docs/GRAPH-SPIRAL-DEMO-PLAN.md` describes `useGraphSpiralController`, `GraphSpiralPage`,
`GraphSpiralBall` and the `/spiral-graph` route as implemented. None are present on this branch —
`apps/demo/src/components` contains no `GraphSpiral*` directory. That work lives in PR #74. Steps 1
and 3 should land before it merges, since the plan's acceptance criteria ("GraphBinding owns every
runtime edge mutation", "removing a ball destroys its tracks and clears publisher state") depend on
#27, #25 and #19.

---

## 6. Target architecture: project-wide graph, cross-motion edges, free tracks

**Stated direction (owner: @chahyasantoso).** The intended end state is **one graph per project**,
not one per motion: observation edges may cross motion boundaries, and tracks that belong to no
motion at all ("free tracks") must be able to participate.

This is a direction, not a next step. Steps 1–3 above are prerequisites for it, and it changes the
priority of several findings. Recording the shape and the known obstacles now so the intervening
work doesn't paint into a corner.

### What today's code makes impossible

`Engine.#mountMotion` constructs a fresh `GraphPublisher` and `GraphBinding` per motion, from that
motion's own `config`. There is no shared registry anywhere in the engine. Three separate blockers,
not one:

1. **No shared publisher**, so no shared topological order and no coordinated flush across motions.
2. **No addressable binding** (#27), so even a same-motion runtime edge mutation has no entry point.
3. **No id namespace.** `normalizeObservationGraph` resolves `edge.source` against
   `nodeIndexes`, populated only from `motion.tracks`. A cross-motion reference is not "unsupported
   by the schema" — it is reported as `Unknown source track 'X'`.

And free tracks (`createTrackInstance`, `createGroupHost`, `adopt`) never touch the graph layer at
all: no `_setGraphGuard`, no publisher registration. `Track`'s own comment — _"Installed by the
graph layer. Absent for standalone tracks, which stay permissive"_ — makes that explicit and
deliberate. A project graph has to change that contract.

### Shape of the target

- **`Engine` owns one `GraphPublisher` + one `GraphBinding` for the whole project.** Mounting a
  motion adds its nodes and edges to the project graph via `binding.addTrack`; unmounting removes
  that subtree. Motions stop owning graph objects entirely — `Motion.setGraphBinding` and
  `Motion.#graphOrder` both go away rather than getting fixed (see Step 4.16).
- **Qualified node ids.** `"motionId/trackId"` for mounted tracks, a reserved scope for free ones
  (`"~/trackId"` or similar — pick one and validate it can't collide with a motion id). Authored
  `observes.source` accepts either a bare id (resolved within the declaring motion, preserving every
  existing project file) or a qualified id. `normalizeObservationGraph` needs a resolution step
  before its existing `nodeIndexes` lookup; the validators need a matching rule with a stable rule
  id so cross-motion typos fail at load, not at mount.
- **One flush barrier.** `flush()` on the shared publisher, once per `gsap.ticker` tick, in project
  topological order. This is A(1) from Step 0 and it is not optional here: per-subscriber recursion
  cannot order two tracks driven by two different motion timelines, and there is no correct answer
  to "which motion's tick recomposes the shared node" without a single barrier.
- **Free tracks are first-class nodes.** `engine.adopt(track)` registers into the project graph.
  `Track`'s "standalone tracks stay permissive" contract narrows to "tracks not adopted by an
  engine," and that needs to be written down, because it's a behavior change for anyone constructing
  tracks directly.

### What this changes about the findings above

- **#9 flips from "redundant" to load-bearing.** A single project graph makes cross-motion cycles
  reachable in ways per-motion validation never had to consider. Keep `#graphGuard`, and keep it
  correct.
- **#7 and #12 get promoted from Low to High.** n becomes every track in the project. Every runtime
  rewire re-validates and re-sorts the _whole project graph_, and `#markDownstream`'s
  O(tracks × edges) scan walks all of it. The heap-based Kahn's rewrite goes from speculative to
  probably-necessary — still gated on a benchmark, but now benchmark at project scale.
- **#16 becomes critical.** One long-lived shared `tracks` Map mutated by two owners across every
  motion mount and unmount, instead of a short-lived per-motion one. Fix it before, not after.
- **#22's failure mode gets permanent.** A single ungraphed registered track anywhere in the project
  disables the flush fast path for _everything_, for the life of the process.
- **Partial-failure atomicity (#24) stops being a local concern.** A failed `addTrack` during a
  mount would leave the project graph — shared by every other motion — in a half-wired state.

### Open questions to settle before designing this

1. **Lifecycle asymmetry.** A cross-motion edge means unmounting motion A can invalidate nodes in
   motion B. Does B's edge become an error, get auto-removed, or resolve to a null source? Pick one
   and make it explicit; today's `applyGraph` edge-diff would silently just invalidate B.
2. **Timeline independence.** Two motions have independent, separately-seekable timelines. If A's
   track observes B's and B is paused mid-scrub, what does A compose against? A single flush barrier
   orders the work but does not answer this.
3. **Ordering vs. mount order.** `normalizeObservationGraph` tie-breaks on declaration index. Across
   motions there is no single declaration order, so the tie-break needs a defined project-level key
   (mount sequence? sorted qualified id?) or the order becomes mount-order-dependent — a worse
   version of #23.
4. **Validation timing.** Today a graph is validated once per motion at load. A project graph is
   only complete once every motion is mounted, so "the project graph is valid" becomes a runtime
   property. Decide whether partial graphs are legal during staged mounting.
