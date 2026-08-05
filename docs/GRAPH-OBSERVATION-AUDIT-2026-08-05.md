# Observation graph audit — verification pass + new findings

**Repo/branch:** `chahyasantoso/motionpath`, `feat/graph-spiral-demo` (`9089393`)
**Date:** 2026-08-05
**Scope read in full:** `usecases/GraphPublisher.js`, `usecases/GraphBinding.js`,
`usecases/normalizeObservationGraph.js`, `usecases/Spawner.js`, `lib/Track.js`, `lib/Motion.js`,
`engines/Engine.js`, `src/index.js`, `docs/GRAPH-SPIRAL-DEMO-PLAN.md`.
**Method:** every claim below is checked against the source on this branch. Prior findings are
labelled Confirmed / Confirmed-but-misprioritized / Partly wrong. New findings are #16–#26.

---

## 0. Headline: the prior review audited a subsystem that is currently unplugged

Before any individual finding, the structural fact that reframes the whole list:

```js
// Engine.js#mountMotion
const publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} });
binding = new GraphBinding({ graph, tracks: trackMap, publisher });
motion.init();
```

Three things follow, and none of them appear in the prior review:

1. **`publish` is a no-op.** Nothing consumes `GraphPublisher`'s output in the engine path.
2. **Nothing calls `flush()`.** Not in `Engine.js`, not in `Motion.js`, not in `TrackGroup`.
3. **The actual composition path bypasses the publisher entirely.** Rendering goes through
   `TrackGroup.composeGraph()`, which walks a mount-time `#graphOrder` and calls
   `track.compose(undefined, patches)` with a **fresh `Map` every call** — no cross-frame cache,
   no dirty tracking, no topological scheduling.

So there are two parallel composition systems in the repo, and the live one is the naive one.
Every `GraphPublisher` caching/scheduling finding in the prior review (#7, #8, half of #12, and
new #21/#22 below) is **latent, not live**. Conversely the prior review's Tier 4 recommendation —
benchmark the O(n²) topological sort — is aimed at the wrong hot path. The real per-frame cost
today is `composeGraph()` recomposing the entire graph from scratch on every tick.

**This should be resolved before optimizing anything inside `GraphPublisher`.** Either wire the
publisher into the render path or stop constructing it in `#mountMotion`. Maintaining both is how
the divergences in §2 got in.

---

## 1. Verdict on findings #6–#15

| # | Verdict | Note |
|---|---------|------|
| 6 | **Confirmed** | `input: edge.role === "input" ? edge.target : undefined` — verbatim, still there. |
| 7 | **Confirmed** | `#markDownstream` does `upstream.includes(sourceId)` inside a full `#upstream` scan. Latent (§0). |
| 8 | **Confirmed** | `throw new AggregateError(...)` is the last statement after all publishes and cache writes. |
| 9 | **Confirmed** | `#graphGuard` BFS walks live `observedEdges`. Analysis is accurate. |
| 10 | **Confirmed, and worse** | Not merely "callable directly with mismatched inputs" — it becomes reachable in production the moment fix #13 is applied. See **#18**. |
| 11 | **Confirmed** | `addEdge`/`addTrack`/`removeEdge`/`removeTrack` all route through `buildTopologicalOrder`, which checks only unknown refs + cycles. |
| 12 | **Confirmed as code, misprioritized** | The `findIndex`+`splice` O(n²) pattern is duplicated in both sorters exactly as described. But per §0 this is not the dominant cost. |
| 13 | **Confirmed as description, recommendation is dangerous** | The redundancy is real. Deleting `onSourceDestroyed` breaks the graph. See **#18**. |
| 14 | **Partly wrong** | See below. |
| 15 | **Confirmed as a no-op, recommendation is wrong** | See below. |
| — | Mount-time pre-wiring split | **Confirmed.** And see **#16**. |
| — | Per-motion graph scoping | **Confirmed**, but the binding of a mounted motion isn't even reachable. See **#16**. |

### #14 is overstated on the destroy path

The claim is that a dependent "keeps serving its last cached patch indefinitely" when a source is
destroyed. On the destroy path that is not what happens. `GraphBinding.removeTrack` → `#commit` →
`applyGraph`, and `applyGraph` contains:

```js
for (const [key, edge] of previousEdgeKeys) if (!nextEdgeKeys.has(key)) invalidationSeeds.add(edge.target);
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
this.#emitLifecycle({ type: "destroyed", track: this, observerIds });  // onLifecycle — second
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
*then* delete it.

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
dangling reference but does *not* keep the graph honest. State this as a hard requirement.

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
`removeEdge` build that array from `this.#order`, i.e. the *previous sort's output*. So the tie-break
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
destroyed. `Track.replaceObserved` carries an explicit *"Atomic pop-and-rewire"* comment — `addTrack`
should hold the same bar: resolve and validate **all** sources first, then wire, and on failure
unwire what was applied and destroy the track.

### #25 — `Engine.#mountMotion` never calls `motion.setGraphBinding(binding)`. (High — this is the demo blocker)

`Motion` already has the API:

```js
setGraphBinding(binding) { ... }
get graphBinding() { return this.#binding; }
destroy() { ...; this.#binding?.destroy(); ... }
```

`#mountMotion` never calls it. `binding` is a local variable, and `binding?.destroy()` appears only
in the `catch`. Consequences on the **success** path:

- `motion.graphBinding` is always `null`. **There is no supported way for application code to reach
  the `GraphBinding` of a mounted motion.** Since the demo plan's acceptance criterion is
  "GraphBinding owns every runtime edge mutation," that criterion is currently unreachable through
  the engine — which is why the demo has to construct its own publisher and binding per ball, walking
  straight into the mount-time pre-wiring trap the prior review flagged.
- `Motion.destroy()`'s `this.#binding?.destroy()` is a no-op. The binding's subscriptions are never
  torn down; it is orphaned and kept alive only by track closures.

One line in `#mountMotion` fixes both. This is the highest value-per-character change in the audit.

### #26 — `TrackGroup.#graphOrder` is frozen at mount; runtime-added tracks are never composed. (High)

```js
composeGraph() {
  const patches = new Map();
  for (const id of this.#graphOrder) { const track = this.#tracks.get(id); if (track) track.compose(undefined, patches); }
  return patches;
}
```

`#graphOrder` is set once, from `graph.order` at mount. `Track.addChild` → `host._mountChild` →
`TrackGroup.mount` adds the child to `#tracks` but **not** to `#graphOrder`. So every runtime-spawned
child is skipped by `composeGraph()` unless it happens to be an upstream dependency of a node that
is in the order.

`Motion.applyGraphOrder(order)` and `TrackGroup.applyGraphOrder(order)` exist to fix this — and
nothing ever calls either one. `GraphBinding` has no notification channel to tell the motion its
order changed. Combined with #25, the graph layer and the render layer have no connection after
mount.

(Note: because `Track.compose` recurses into its sources through the shared `ctx` with a `COMPOSING`
sentinel, the *ordering* within `#graphOrder` is largely self-correcting. **Membership** is what
matters, and membership is what's broken.)

---

## 3. Corrected summary table

| # | Finding | Location | Severity | Live today? |
|---|---------|----------|----------|-------------|
| 25 | Engine never calls `motion.setGraphBinding` — binding unreachable + never destroyed | `Engine` | **High** | Yes |
| 26 | `TrackGroup.#graphOrder` frozen at mount; spawned tracks never composed | `Motion`/`TrackGroup` | **High** | Yes |
| 0 | Publisher constructed with `publish: () => {}`, `flush()` never called; render path bypasses it | `Engine` | **High** | Yes |
| 19 | `removeChild` strips edges without notifying the binding or publisher | `Track` | High | Yes |
| 16 | Publisher and binding share one mutable `tracks` Map | `GraphPublisher` | High | Yes (latent) |
| 18 | Deleting `onSourceDestroyed` desyncs the binding permanently | `Track`/`GraphBinding` | High | On applying prior fix |
| 17 | `removeTrack` is not dead code; prior fix breaks destroy + leaks a timeline | `GraphPublisher` | High | On applying prior fix |
| 6 | `addEdge` loses the `input` slot name | `GraphPublisher` | High | No |
| 10 | `applyGraph` silently accepts nodes with no track | `GraphPublisher` | High | Only via #18 |
| 11 | Publisher's own mutation API skips schema validation | `GraphPublisher` | High | No |
| 24 | `GraphBinding.addTrack` leaves partial wiring on failure | `GraphBinding` | Medium | Yes |
| 22 | Ungraphed registered track permanently disables the flush fast path | `GraphPublisher` | Medium | Latent |
| 20 | `replaceObserved` emits no `edge-added` event | `Track` | Medium | Yes |
| 14 | Auto edge cleanup skips invalidation | `Track` | Medium | Only via #19 |
| 15 | `replaceObserved`'s `ignoring` arg is discarded (and unnecessary) | `Track` | Low | Yes, harmless |
| 12 | O(n²) topological tie-break on every mutation | `normalizeObservationGraph` | Low | Latent |
| 7 | O(n²) downstream propagation | `GraphPublisher` | Low | Latent |
| 8 | `AggregateError` thrown after side effects | `GraphPublisher` | Low | Latent |
| 21 | `retry.onExhausted` validated then ignored | `GraphPublisher` | Low | Yes |
| 23 | Two sorters tie-break on different indices | both | Low | Yes |
| 13 | `onSourceDestroyed` redundant, payload unused | `Track` | Low | Yes |
| 9 | `#graphGuard` redundant via the binding path | `GraphPublisher` | Low | Yes |

---

## 4. Proposed solution, sequenced

### Step 0 — Decide what `GraphPublisher` is for (blocks everything else)

Pick one, explicitly, and write it down:

- **(A) Wire it in.** `Engine.#mountMotion` passes a real `publish` that feeds the renderer, and the
  frame loop calls `flush()` instead of `TrackGroup.composeGraph()`. `composeGraph()` becomes a
  test/debug helper or is deleted. This is the design the docs describe and the only version where
  #7/#8/#12/#21/#22 are worth a line of work.
- **(B) Don't.** Stop constructing `GraphPublisher` in `#mountMotion`; keep it as a standalone
  use-case for consumers that want cached, scheduled publishing, and let the engine keep the naive
  recompose.

Do not ship (C) "both, unwired" — that's the state that produced #25 and #26. **Recommendation: (A).**
The spiral demo's own acceptance criterion ("a base progress change republishes the base and
downstream transition nodes only") is unverifiable under (B).

### Step 1 — Reconnect the graph layer to the render layer (unblocks the demo)

1. `#mountMotion`: add `motion.setGraphBinding(binding)` after construction. (#25)
2. Give `GraphBinding` a commit notification — e.g. an `onCommit(graph)` callback passed by the
   engine — and wire it to `motion.applyGraphOrder(graph.order)`. Runtime-added nodes then enter
   `#graphOrder` automatically. (#26)
3. `GraphBinding.addTrack` becomes the only supported way to add a runtime node, and it must reach
   `TrackGroup.mount`. Spawned children that need to participate in the graph go through the binding,
   not through `Track.addChild` alone.

### Step 2 — Close the ownership seams (small, mechanical, no design tradeoffs)

4. `new Map(tracks)` unconditionally in `GraphPublisher`'s constructor and `applyGraph`. (#16)
5. Bidirectional set assertion in `applyGraph`: every graph node has a track **and** every track has
   a graph node, else throw. Fixes #10 and #22 in one guard, matching the project's throw-don't-strip
   stance.
6. Make `GraphPublisher`'s `"destroyed"` hook stop mutating the tracks map: it should clear only its
   own scheduling state (`#cache`, `#marked`, `#publishPending`, `#retryState`, hook) and leave
   membership to `applyGraph`. This is the real fix behind #17/#18 — after it, destroy ordering stops
   mattering, and `onSourceDestroyed` can be deleted safely (#13) rather than dangerously.
7. Delete `addEdge`, `addTrack`, `removeEdge` and `buildTopologicalOrder`. Keep `removeTrack`
   (rewritten per step 6). Public surface becomes `applyGraph`/`flush`/`markDirty`/`removeTrack`.
   Kills #6, #11, #23, and one of the two O(n²) copies from #12. (#17)
8. Drop the third argument from the `#graphGuard` call in `replaceObserved`. Do **not** implement it.
   (#15)
9. Delete `retry.onExhausted`, or implement `"retain"`. Do not keep validating an ignored option. (#21)

### Step 3 — Fix the removal paths (correctness)

10. Route `removeChild`'s edge teardown through an invalidation that the publisher actually hears:
    have `#removeObservedKey` fire `#invalidate("observation")` on the observer, or have
    `#detachObservationEdges` invalidate each affected dependent once at the end. (#19, #14)
11. Make `GraphBinding.addTrack` genuinely atomic: resolve and validate all sources up front, then
    wire; on failure, unwire applied edges and destroy the track. (#24)
12. Emit `"edge-added"` from `replaceObserved` for each addition, matching `setObserved`. (#20)

### Step 4 — Design calls, scoped separately

13. **Move wiring into `GraphBinding`.** A static factory that wires `setObserved` from `graph.edges`
    itself, so `Engine.#wireObservations` disappears and `#assertTrackGraphMatches` becomes
    structurally unnecessary. Only worth doing after Step 1, since Step 1 changes who calls what.
14. **`flush()` contract.** One-line doc comment: it always applies successful patches and throws only
    to report failures, never to roll back. No `flushSafe()` until a caller needs it. (#8)
15. **Project-level graph scoping.** Unchanged from the prior review: a real extension, not a fix.
    Note that #25 makes today's situation worse than "per-motion scoping" implies — the binding isn't
    scoped to the motion, it's unreachable from it.

### Step 5 — Measure, then optimize

16. Only after Step 0 resolves to (A): benchmark at demo scale (30-ball waves, spawn + pop + reflow).
    Measure `flush()` and `normalizeObservationGraph` separately. The heap-based Kahn's rewrite for
    #12 and the inverted `#downstream` map for #7 are both correct fixes; neither is justified by a
    number anyone has taken yet. `#7`'s inverted map is cheap enough (same pattern `#upstream`
    already uses) that it can ride along with Step 2 if convenient — `#12`'s should not.

---

## 5. Note on the demo branch state

`docs/GRAPH-SPIRAL-DEMO-PLAN.md` describes `useGraphSpiralController`, `GraphSpiralPage`,
`GraphSpiralBall` and the `/spiral-graph` route as implemented. None of them are present on
`feat/graph-spiral-demo` at `9089393` — `apps/demo/src/components` contains no `GraphSpiral*`
directory. That work lives in PR #74 on another branch. Steps 1 and 3 above should land before it
merges, since the plan's acceptance criteria ("GraphBinding owns every runtime edge mutation",
"removing a ball destroys its tracks and clears publisher state") depend on #25, #26 and #19.
