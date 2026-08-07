# MotionPath v5 architecture refactor plan

**Status:** proposal, not yet accepted
**Base branch:** `feat/graph-spiral-demo`
**Scope:** structural refactor of the runtime. Not a feature plan, not a graph-feature plan.
**Supersedes:** the staged plan that led with `Progressable` + `TrackSlot` (see "What this replaces" below)

---

## How to read this document

It goes from widest to narrowest, deliberately:

1. **Part 1** — what the system actually is today, in one page.
2. **Part 2** — the five structural faults, each with the exact code that proves it.
3. **Part 3** — the target architecture and the two ideas it rests on.
4. **Part 4** — the phases. Each one states *why it exists*, *what changes*, *what proves it worked*.
5. **Part 5** — sequencing, and what to explicitly not do.
6. **Appendix** — evidence index, so every claim above is checkable.

If you only read one section, read **Part 2.1** and **Part 3.1**. Everything else follows from those.

---

# Part 1 — Bird's eye

## 1.1 What MotionPath is

A declarative animation runtime. You author a JSON project; the runtime compiles it into
keyframed interpolators, schedules them on a timeline, composes their sampled state into
renderer-neutral *patches* through a plugin pipeline, and hands those patches to a renderer
adapter. GSAP is the scheduling engine. React is one consumer. The DOM is one renderer.

The ambition, stated in `docs/ARCHITECTURE.md` and visible throughout the code, is that the
domain model is platform-independent — that a Flutter or Canvas or WebGL backend is an
infrastructure swap, not a rewrite.

## 1.2 The layers, as intended

```text
Schema (JSON)
  → normalize / validate      (contract, validators, schema/)
  → compile                   (ResolveTrack, BuildTrackTween, plugins)
  → schedule                  (Motion, TrackGroup, TriggerDelegate)
  → compose                   (Track.compose, ComposeTrackPatch, mergePatches)
  → publish                   (GraphPublisher)
  → render                    (domRenderer, React hooks)
```

That layering is genuinely good. The plugin staging model (`STAGE_ORDER` in
`BuildTrackTween.js`), the collision detection on outputs / eases / tweenVars, the immutable
graph IR, the failure-isolation semantics in `GraphPublisher.flush()`, and the reasoning
comments in `GaplessLayoutDelegate` are all above the bar. The v4.1 plan's phases 0–9 largely
landed and the codebase is better for it.

## 1.3 The verdict

**The layering is sound. The object model underneath it is not.**

Four distinct concepts are collapsed into one class, `Track`. Three different classes each
implement "a thing that holds tracks and plays them." Two different subsystems each implement
"compose patches and get them to a renderer," and the one with all the caching and correctness
machinery is the one that never runs in production. The result is a runtime where the
abstractions are correct on paper and duplicated three ways in practice.

This is not decay. It is the normal outcome of five feature-driven versions layered onto an
object model that was designed for v1's problem. The fix is not more layers. It is fewer
objects, each with a name that means exactly one thing.

---

# Part 2 — The five structural faults

## 2.1 Fault #1: `Track` is four classes wearing one name

`packages/core/src/lib/Track.js` is 20 private fields and ~33 public members. Group them and
four separate objects fall out:

| Role | Fields | Members |
|---|---|---|
| **Interpolator** (leaf) | `#interpolationTimeline`, `#proxyState` | `progress()`, `duration`, `getSnapshot()` |
| **Composer** | `#plugins`, `#resolvedTrack` | `compose()` |
| **Topology node** | `#parent`, `#children`, `#host`, `#currentOffset`, `#staggerOffset`, `#layoutDelegate` | `addChild()`, `removeChild()`, `getChild()`, `childCount`, `_mount()`, `_unmount()`, `isMounted` |
| **Data-flow node** | `#observed`, `#observers`, `#graphGuard` | `setObserved()`, `removeObserved()`, `replaceObserved()`, `observedEdges`, `observedSources`, `observerCount`, `_addObserver()`, `_removeObserver()`, `_setGraphGuard()` |
| **Playback handle** | `#groupHost` | `play()`, `pause()`, `seek()`, `reverse()`, `_attachGroupHost()` |

That is five, actually. The fifth (`#groupHost`) exists solely so that `Engine.createGroupHost()`
can return something a caller can press play on.

**Why this matters, concretely, not aesthetically:**

- Every one of the ~33 members is reachable from every call site that holds a `Track`. The
  spiral controllers hold `Track` handles and can legally call `_setGraphGuard`.
- Dead state hides in the crowd. `#staggerOffset` is assigned in `addChild()` and read nowhere
  in the repository. Nobody noticed because the class has 20 fields.
- Two unrelated subsystems (`GraphPublisher`, `TrackGroup`) both reach into `Track` internals
  through `_`-prefixed pseudo-private methods, because there is no smaller surface to depend on.
- It is the single reason the codebase cannot answer "what is a leaf?" — which is exactly the
  question the grandchild bug turns on.

## 2.2 Fault #2: the composition tree is flat, and that is the root of the grandchild bug

This is the most important finding in the document. The tree structure in `Track` is a
**bookkeeping illusion**. There is no nesting in the actual scheduler.

Trace it:

```js
// Track.addChild — offset computed relative to THIS node's own children
const spawnOffset = this.#layoutDelegate.computeSpawnOffset(
  Array.from(this.#children.values()), { stagger }
);
child.#currentOffset = spawnOffset;
if (this.#host) this.#host._mountChild(child, spawnOffset);

// TrackGroup.mount — that relative offset is used as an ABSOLUTE master-timeline position
this.#masterTimeline.add(tween, position);
```

`TrackGroup._mount(this)` sets the *same* `TrackGroup` as `#host` on every descendant. So the
whole tree — depth 1, depth 2, depth 7 — flattens into one master timeline. Each node's offset
is computed against its own siblings and then written as an absolute time.

**Depth 1 is correct by accident.** `Engine.createGroupHost()` mounts the host track at position
`0`, so `parentOffset + localOffset == localOffset` and nobody notices.

**Depth 2 is wrong by construction.** A grandchild whose parent sits at t=3.5s and whose local
offset is 0 gets scheduled at master t=0. The error is exactly the parent's offset, and it
compounds at every additional level.

Three more defects live in the same fault:

- **`_reflowChild` inherits the bug.** It tweens `startTime` to a parent-relative offset on the
  master timeline. Correct at depth 1, wrong below it.
- **Unmount is not recursive.** `TrackGroup.unmount(track)` removes exactly one proxy tween.
  Remove a mid-tree node and its descendants' tweens stay in `#masterTimeline`, stay in
  `#proxies` and `#tracks`, and keep rendering. Orphaned but still scheduled.
- **`Track.destroy()` never unmounts.** It sets `this.#host = null` directly without calling
  `#host._unmountChild(this)`. The proxy tween survives in the master timeline. Under the
  spiral's churn (30 balls per wave, waves on repeat) this accumulates. The demos only escape
  it because their controllers call `removeChild()` *before* `unmount()` — an ordering
  requirement that is documented nowhere and enforced by nothing.

**The critical implication for planning:** a duck-typed `Progressable` interface does *not* fix
this. Giving `Track` and `Motion` a common `progress`/`duration` shape changes nothing about
where `_mountChild` writes the offset. The bug is that composition is not recursive. Only
making it recursive fixes it.

## 2.3 Fault #3: three implementations of "a composite that holds tracks"

```text
TrackGroup            — timeline + tracks Map + proxies Map + graph order
Motion                — trigger + TrackGroup + a SECOND track collection (#initialTracks)
Engine.createGroupHost — timeline + TrackGroup + a synthetic 1-second "host" Track,
                         plus a fourth playback path via Track#groupHost
```

All three schedule tracks on a GSAP timeline. All three expose play/pause/seek/reverse. They
share no code path.

`createGroupHost` deserves particular attention, because it is not a helper — it is a **parallel
production runtime**. Both spiral controllers use it, not `Motion`. It fabricates a fake
1-second track whose only purpose is to be a handle, then bolts playback onto it via
`_attachGroupHost`. Functionally it is a `Motion` with a `ManualTriggerDelegate` plus a
vestigial track. The refactor plan I am replacing described this as duplication between
`createGroupHost` and `ManualTriggerDelegate`; it is broader than that. It is a second
implementation of the composite, and it is the one the demos actually exercise.

**`Motion`'s two-phase lifecycle is not a "maybe collapses" item. It is actively broken:**

```js
init() {
  if (this.#active) this.destroy();   // destroy() empties #initialTracks and destroys each track
  this.#destroyed = false;
  ...
  for (const { track, position } of this.#initialTracks) this.#group.mount(track, position);
  //     ^ now empty. Second init() silently yields an empty Motion.
}
```

And `destroy()` also calls `this.#triggerDelegate.destroy()`, so the re-`init()` calls `.build()`
on a killed delegate. Calling `init()` twice is a silent no-op-with-collateral-damage. This is
not a lifecycle question to trace later — it is a bug that exists because the same track set is
mirrored across `#initialTracks`, `TrackGroup#tracks`, and `TrackGroup#proxies`, with every
method branching on `#active` to pick which mirror to read.

## 2.4 Fault #4: two compose-and-render paths, and the good one is switched off

This is the fault with the largest runtime cost and the least visibility.

**Path A — `GraphPublisher`.** Topologically ordered, persistently cached, dirty-tracked,
failure-isolating, downstream-invalidating. Roughly 250 lines of careful machinery. In
`Engine.#mountMotion` it is constructed like this:

```js
const publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} });
binding = new GraphBinding({ graph, tracks: trackMap, publisher });
```

`publish` is a no-op. `binding` is assigned to a local and **never passed to
`motion.setGraphBinding()`** on the success path — it is constructed, wired, and dropped.
Nothing in the Engine path ever calls `publisher.flush()`.

**Path B — React subscribers.** `useMotionSubscribers` subscribes directly to each `Track` and
calls `targetTrack.compose(data)` — **with no `ctx` argument**. `Track.compose` then allocates a
fresh memo `Map` and recursively composes every upstream source, from scratch, for that one
subscriber. `Track.progress()` calls `#notify()` on every frame the master timeline advances.

So the production render path is: per frame, per subscriber, recompose the entire upstream
closure. Cost is O(subscribers × chain depth) composes per frame, with a fresh allocation each
time. The persistent cache that would collapse this to O(dirty nodes) exists, is tested, and is
never consulted.

Worse: `Track.progress()` also fires `#invalidate("progress")`, which the publisher's lifecycle
hook turns into `markDirty(id)`. So the publisher *is* accumulating a dirty set every frame, for
a flush that never comes. It is a growing `Set` with no consumer.

The one place `flush()` is called is `useGraphSpiralController`, once at construction, per ball.

**There is also a third path.** `Overlay` (`usecases/Overlay.js`) layers one track's patch onto
another — which is precisely what an `output`-role observation edge does. The two spiral
controllers demonstrate this directly: `useSpiralWaveController` uses `Overlay` for
entrance/exit, `useGraphSpiralController` uses observation edges for the same visual effect.
Same product behavior, two mechanisms, same folder.

## 2.5 Fault #5: the platform boundary is declared, not enforced

`docs/ARCHITECTURE.md` says core is renderer-agnostic. `architecture-boundary.test.js` enforces
exactly two rules: no `react` imports, no `.jsx` imports. **GSAP is not checked.**

Direct `import { gsap } from "gsap"` in core, non-test:

| Module | Layer | Should it? |
|---|---|---|
| `adapters/gsapPlatform.js` | adapter | yes |
| `adapters/domRenderer.js` | adapter | yes |
| `lib/gsapTickerClock.js` | lib | should move to `adapters/` |
| `lib/Motion.js` | domain | **no** |
| `lib/TriggerDelegate.js` | domain | **no** |
| `engines/Engine.js` | domain | **no** |
| `usecases/BuildTrackTween.js` | usecase | **no** |

And the leak goes deeper than imports. `Track` never imports gsap, but
`#interpolationTimeline` **is** a raw GSAP tween, injected by `createTrack`. `duration`,
`progress()`, and `destroy()` all call GSAP methods on it. `getSnapshot()` strips a `_gsap` key
out of the proxy state — a GSAP implementation detail leaking into the domain snapshot
contract. The leaf is as GSAP-bound as the composite; it just launders the dependency through
a constructor argument.

This is why "quarantine GSAP behind one field on `Track`" does not achieve the Flutter-port
goal. Quarantining the *outer* tween while the leaf still holds an inner one relocates the
dependency. **Two ports are required, not one.**

One more fragility worth naming explicitly:

```js
gsap.to(track, { progress: 1, ease: "none", duration: track.duration || 0 })
```

This works only because GSAP special-cases function-valued properties — it sees `progress` is a
function and calls it as a setter. It is the load-bearing line of the entire scheduler and it is
an undocumented GSAP behavior. Any port design must not enshrine it.

---

# Part 3 — Target architecture

## 3.1 Two ideas

**Idea 1: composition is recursive.** A composite of animations is itself an animation. It has a
duration, it has a progress, it can be nested inside another composite. Today the code asserts
this in its vocabulary and denies it in its scheduler. Make it true and the grandchild bug, the
reflow bug, the orphan-unmount leak, and `createGroupHost` all disappear together — because
they are one bug.

**Idea 2: the leaf and the composite each need a port.** A leaf samples a curve. A composite
schedules children in time. These are different capabilities and they need different
abstractions:

```js
// Port A — Interpolator. Owns keyframe sampling. Today: a raw GSAP tween.
interface Interpolator {
  readonly duration: number;
  sample(t01: number): Record<string, unknown>;  // pure-ish: seek + read
  dispose(): void;
}

// Port B — Scheduler. Owns time and nesting. Today: a raw GSAP timeline.
interface Scheduler {
  readonly duration: number;
  add(child: Progressable, atSeconds: number): SchedulerSlot;
  remove(slot: SchedulerSlot): void;
  move(slot: SchedulerSlot, toSeconds: number, transition?): void;
  seek(t01: number): void;
  play(): void; pause(): void; reverse(): void;
  onTick(cb): Unsubscribe;
  dispose(): void;
}
```

`SchedulerSlot` is the thing the prior plan called `TrackSlot`, correctly identified but scoped
to the wrong layer. It belongs to the **Scheduler port**, not to `Track`. It is infrastructure's
handle on a domain object, and the domain should hold it opaquely and never inspect it.

Critically, the GSAP scheduler adapter must drive children explicitly, not by property-setter
magic:

```js
// adapters/gsap/GsapScheduler.js
add(child, at) {
  const proxy = { t: 0 };
  const tween = gsap.to(proxy, {
    t: 1, ease: "none", duration: child.duration || 0,
    onUpdate: () => child.progress(proxy.t),     // explicit. no function-property trick.
  });
  this.#timeline.add(tween, at);
  return { tween };
}
```

That one change removes the load-bearing undocumented behavior from 2.5 and does it in the
first structural phase, not deferred into the risky tween-collapse work.

## 3.2 The object model

```text
Progressable                      { id, duration, progress(p?), getSnapshot(), subscribe() }
  ├── Track      (leaf)           Interpolator + plugin composition. No children. No host.
  └── Motion     (composite)      Scheduler + ordered children + LayoutDelegate + Trigger.
                                  Is itself Progressable → nests inside another Motion.

ObservationGraph                  Owns edges, guard, topological order, publish scheduling.
                                  Holds Progressables. Is NOT a field on them.

Ports                             Interpolator · Scheduler · Clock · Renderer
Adapters                          adapters/gsap/{GsapInterpolator, GsapScheduler, GsapClock}
                                  adapters/dom/domRenderer
```

`Track` keeps its public name and loses three of its five roles. That is a smaller API break
than renaming it, and it resolves the overload just as completely — because "track" now means
exactly one thing: a leaf with a curve.

`TrackGroup`, `createGroupHost`, `Track#groupHost`, `Track._attachGroupHost`, `Track.play/pause/
seek/reverse`, `Track._mount/_unmount`, `Track#host`, `Track#staggerOffset`, and
`AutonomousTimelineControls` are all **deleted**, not migrated.

## 3.3 Target flow

```mermaid
flowchart TB
  subgraph contract[Contract]
    schema[Project schema] --> norm[normalize + validate]
  end
  subgraph domain[Domain: zero platform imports]
    norm --> track[Track leaf]
    norm --> motion[Motion composite]
    motion -->|nests| motion
    track --> graph[ObservationGraph]
    motion --> graph
  end
  subgraph ports[Ports]
    interp[Interpolator]
    sched[Scheduler]
    clock[Clock]
    rend[Renderer]
  end
  track --> interp
  motion --> sched
  graph --> pub[Publisher: one flush per tick]
  clock --> pub
  pub --> rend
  subgraph infra[Adapters: the only place gsap exists]
    gi[GsapInterpolator] -.implements.-> interp
    gs[GsapScheduler] -.implements.-> sched
    gc[GsapClock] -.implements.-> clock
    dr[domRenderer] -.implements.-> rend
  end
```

Note the single arrow from `pub` to `rend`. One compose path. One flush per tick. React
subscribes to the publisher, not to individual tracks.

---

# Part 4 — The phases

Nine phases. Each is one PR unless stated. Each states why it exists before what it does,
because a phase whose rationale you cannot restate is a phase you will implement wrong.

---

## Phase 0 — Pin the truth down

**Why.** Every phase below changes timing behavior. Without characterization tests you cannot
distinguish "refactor broke it" from "it was already broken." Two of the three findings in
Part 2 were latent for versions precisely because nothing asserted them.

**What.**

1. **Failing grandchild test**, committed red and skipped with a link to this doc:
   ```js
   it.fails("schedules a grandchild at parentOffset + localOffset", () => {
     // host@0 → child@3.5 → grandchild@0  ⇒  expect master position 3.5, actual 0
   });
   ```
2. **Failing orphan test**: remove a mid-tree node, assert its descendants' proxies are gone
   from the master timeline. Currently red.
3. **Failing `init()`-twice test**: assert a re-`init()`ed Motion still holds its tracks.
   Currently red.
4. **Compose-count benchmark.** Instrument `Track.compose` with a counter; render a 3-deep,
   10-subscriber scene for 60 frames; record the number. This is the baseline that justifies
   Phase 6 with a number instead of an argument.
5. **Extend `architecture-boundary.test.js`:** ban `from "gsap"` outside `src/adapters/`.
   Add the seven current violators to an explicit allow-list that phases 3 and 4 empty out.
   A shrinking allow-list is a progress bar.

**Exit.** All new tests present. Red ones red for the documented reason. Baseline recorded in
the PR body. Zero behavior change.

**Blast radius.** Test files only.

---

## Phase 1 — Unblock and delete the obviously dead

**Why.** Three small things currently block or pollute everything downstream, and one of them
makes a public API unusable. Get them out of the way in one cheap PR so no later phase has to
reason around them.

**What.**

1. **Validator fix.** `parseV4Project` hard-throws on missing `motion.trigger.type`:
   ```js
   if (!type) throw new Error(`Motion "${motion.id}" is missing trigger.type.`);
   ```
   But `Engine.mountWithDelegate(id, delegate)` exists precisely so a caller can supply the
   trigger at mount time. A project authored for it cannot load. Default a missing
   `trigger.type` to `"manual"` and validate at mount, not at parse.

2. **Trigger injection with a null-object default.** `ManualTriggerDelegate` becomes the
   injected default rather than an optional-checked special case. Removes the branch; the
   delegate is already shaped as a null object.

3. **Delete the orphan `GraphBinding` in `Engine.#mountMotion`.** It is constructed, wired to a
   no-op publisher, and never handed to the Motion. Either call `motion.setGraphBinding(binding)`
   or delete the construction. **Delete it** — Phase 6 rebuilds this wiring properly, and
   carrying a dead object through five phases guarantees somebody "fixes" it into permanence.

4. **Delete `Track#staggerOffset`.** Written once, read never.

5. **Schema rename.** `project.tracks[]` and `motion.tracks[]` are different kinds: the former
   is a *library of prototypes* (`engine.createTrackInstance("ball-track", overrides)`), the
   latter is a *list of instances*. Rename the top-level to `project.trackLibrary[]`. This is
   not cosmetic — because `#wireObservations` only runs inside `#mountMotion`, an `observes`
   clause on a library entry is silently inert. Renaming makes that a type distinction instead
   of a footgun, and the validator can then reject `observes` on library entries outright.

**Tests.** Load a project whose motion omits `trigger.type` and mount it with an injected
delegate. Assert `observes` on a `trackLibrary` entry is a validation error.

**Exit.** `mountWithDelegate` is reachable from an authored project. Boundary allow-list
unchanged.

**Blast radius.** `parseV4Project.js`, `normalizeProject.js`, validators, fixtures, `Engine.js`,
`Track.js`. Fixtures dominate — mechanical.

---

## Phase 2 — One composite

**Why.** Fault #3. Three implementations of the same concept means every later phase costs
triple. This must land before the ports (Phase 3), or you will design ports against three
different client shapes and get the ports wrong.

The prior plan sequenced this fourth and called it "a rename, zero external API change." It is
neither. It is the deletion of a triplicate and of the two-phase lifecycle bug, and
`createGroupHost` — which both production demos depend on — goes with it.

**What.**

1. **Merge `TrackGroup` into `Motion`.** One class. One collection. `#initialTracks`,
   `#tracks`, and `#proxies` become a single ordered `Map<id, { child, slot, offset }>`.

2. **Delete two-phase init.** Build the scheduler in the constructor. `init()` disappears;
   `mount()` has one code path instead of an `#active` branch. This deletes the
   `init()`-twice bug rather than tracing it — the bug was only possible because two
   collections had to be kept in sync across a lifecycle boundary.

3. **Delete `Engine.createGroupHost`** and its whole apparatus: `Track#groupHost`,
   `_attachGroupHost`, and `Track.play/pause/seek/reverse`. Replace with:
   ```js
   engine.createMotion({ id, trigger: { type: "manual" }, staggerTransition, autoplay });
   ```
   Migrate both spiral controllers. They lose the synthetic 1-second host track and gain a real
   `Motion` handle. **This is the phase that touches the demos** — expect the review here.

4. **Collapse the trigger delegates.** `Scroll`/`Time`/`Manual` each re-implement identical
   `play`/`pause`/`seek`/`reverse`/`onComplete` bodies that forward to
   `AutonomousTimelineControls`. Reduce to one `TriggerDelegate` class plus three
   *configuration* functions returning scheduler vars. Deletes ~40 lines of pure duplication
   and makes Phase 3 a one-file change instead of a four-file one.

5. **Fix unmount asymmetry.** `TrackGroup.unmount` did not destroy; `Motion.unmount` did.
   Pick one — `unmount()` detaches and returns the child, `destroy()` destroys. Ownership
   becomes explicit.

**Tests.** `init()`-twice test from Phase 0 goes green. Both spiral demos render identically —
capture before/after screenshots, this is a visual-regression phase. Assert one and only one
class in `lib/` schedules onto a timeline.

**Exit.** Grep for `TrackGroup` and `createGroupHost` returns docs only. `Track` is down to
~17 fields.

**Blast radius.** `Motion.js`, `Track.js`, `Engine.js`, `TriggerDelegate.js`, both spiral
controllers, `Motion.test.js`, `MotionPhase2.test.js`, `Track.test.js`, engine tests. This is
the widest PR in the plan. Do not combine it with anything.

---

## Phase 3 — Ports

**Why.** Fault #5. The Flutter-port claim is currently false, and "one field on `Track`" does
not make it true because the leaf holds a GSAP tween too. Two ports or nothing.

**What.**

1. Define `ports/Interpolator.js` and `ports/Scheduler.js` — JSDoc-typed contracts, zero imports.
2. `adapters/gsap/GsapInterpolator.js` — absorbs the `gsap.to(proxy, { keyframes })` construction
   from `BuildTrackTween`. `BuildTrackTween` keeps the plugin staging, collision detection, and
   percent-key merging (all pure domain logic) and returns a **keyframe description**, not a
   tween. The adapter turns that description into a tween.
3. `adapters/gsap/GsapScheduler.js` — absorbs timeline construction, `add`/`remove`/`move`, the
   `startTime` reflow tween, and the `render(time, true, true)` calls. **Uses the explicit
   `onUpdate → child.progress(t)` form from 3.1**, not the function-property trick.
4. Move `gsapTickerClock.js` into `adapters/gsap/GsapClock.js`.
5. `Track` takes an `Interpolator`, not a tween. `getSnapshot()` stops stripping `_gsap` —
   the adapter is now responsible for returning a clean sample. That leak had no business in
   the domain.
6. Empty the boundary-test allow-list.

**Tests.** A `FakeInterpolator` + `FakeScheduler` (plain objects, arrays, a manual clock) run
the full `Track`/`Motion` test suite with zero GSAP. If that suite passes headless, the
platform-independence claim is *demonstrated* rather than asserted — and that demonstration is
the actual deliverable of this phase, more than the ports themselves.

**Exit.** `grep -rn 'from "gsap"' packages/core/src --include=*.js | grep -v adapters/` is empty.
The fake-backed suite is green in CI.

**Blast radius.** `Track.js`, `Motion.js`, `createTrack.js`, `BuildTrackTween.js`,
`TriggerDelegate.js`, `Engine.js`, new `ports/` and `adapters/gsap/`.

---

## Phase 4 — Make composition actually recursive

**Why.** Fault #2. This is the phase that fixes the grandchild bug, and it can only happen here:
it needs one composite (Phase 2) and a `Scheduler` port that supports nesting (Phase 3).

**What.**

1. `Motion` implements `Progressable`. `duration` is derived from its scheduler. `progress(p)`
   seeks its scheduler.
2. **`Motion.add(child, at)` accepts any `Progressable`** — a `Track` or another `Motion`.
   `Scheduler.add` nests a child scheduler as a child timeline.
3. **Offsets become parent-relative, permanently.** `LayoutDelegate` already computes
   parent-relative offsets correctly — `GaplessLayoutDelegate` is the best-reasoned file in the
   repo and needs no changes. The bug was never in the delegate; it was that its output was
   consumed as an absolute time. Now it isn't.
4. **Delete the flattening apparatus:** `Track#host`, `Track._mount`, `Track._unmount`,
   `Track.isMounted`, `_mountChild`, `_unmountChild`, `_reflowChild`. Children live on `Motion`.
   `Track` becomes a true leaf with no topology at all.
5. Removing a subtree removes its scheduler, which removes its children — recursion handles
   the orphan leak for free. Same for destroy.

**Tests.** Phase 0's grandchild and orphan tests go green. Add: 3-deep nesting with staggers at
every level; mid-tree removal reflows siblings and takes descendants with it; destroy-without-
remove leaks nothing.

**Exit.** No `it.fails` remaining from Phase 0. `Track` has no `parent`, no `children`, no
`host`. Down to ~9 fields.

**Blast radius.** `Track.js`, `Motion.js`, `adapters/gsap/GsapScheduler.js`, spiral controllers,
`TowerDefense`, layout tests.

**Risk.** Highest timing risk in the plan. Nested GSAP timelines behave differently from a flat
timeline with respect to `render()` propagation and `startTime` reflow. **Write an isolated
spike first**, outside the codebase: nested timeline + a `startTime` tween on a child of a child,
assert it renders. Do not start Phase 4 until that spike runs. This is the one place the prior
plan's "verify with a repro, not reasoning" instinct belongs — it applied it to the tween
collapse, which is optional, and not to nesting, which is mandatory.

---

## Phase 5 — Move the graph off `Track`

**Why.** Fault #1's last piece. Topology left in Phase 4; data flow leaves here. Structural
composition (a tree, about time) and observational composition (a DAG, about data) are
different-shaped problems, and the prior plan was right to refuse to unify them. But "don't
unify them" implies "don't store them in the same object either," which it didn't follow through
on.

**What.**

1. `ObservationGraph` owns `edges`, the guard, and topological order. Edges are stored in the
   graph, keyed by node id — not in `Track#observed`/`#observers`.
2. `Track.compose(source, ctx)` becomes pure: plugins + input, no graph walking. The graph
   layer resolves upstream contributions and passes them in.
3. `setObserved`/`removeObserved`/`replaceObserved` move to the graph API. `GraphBinding`'s
   atomic-transaction logic — which is genuinely good — becomes the graph's public mutation
   surface rather than a separate object coordinating two others.
4. **Collapse three cycle detectors into one.** `GraphPublisher.#graphGuard` walks live
   `observedEdges`; `GraphBinding.#candidateGraph` re-normalizes and validates; and
   `normalizeObservationGraph` validates at parse. One owner: `ObservationGraph`.
5. Delete `Track._setGraphGuard`, `_addObserver`, `_removeObserver`.

**Tests.** Existing graph suites pass against the new surface. A `Track` in isolation has no
observation API. Cycle rejection is asserted in exactly one place.

**Exit.** `Track` is ~7 fields: id, interpolator, plugins, resolvedTrack, subscribers,
eventBus, destroyed. One role. The name finally means one thing.

**Blast radius.** `Track.js`, `GraphBinding.js`, `GraphPublisher.js`, `normalizeObservationGraph.js`,
`Engine.js`, `useGraphSpiralController`, graph test suites. Large but mechanical — the logic
moves, it doesn't change.

---

## Phase 6 — One compose path

**Why.** Fault #4, and the biggest performance win available. Right now the cached, ordered,
failure-isolating publisher is dark code, and the live path recomposes the world per subscriber
per frame. This is also where the value of Phases 3 and 5 gets realized: with a `Clock` port and
a graph that owns ordering, a single per-tick flush is a small change.

**What.**

1. **`publish` becomes the renderer fan-out**, not `() => {}`. `Motion` owns a publisher whose
   `publish(trackId, patch)` dispatches to that track's subscribers.
2. **React subscribes to the publisher.** `useMotionSubscribers` stops calling
   `track.compose(raw)` directly and registers a patch consumer. One flush per clock tick
   serves every subscriber from one shared `ctx`.
3. `Track.progress()` marks dirty; it no longer notifies-and-composes inline.
4. `Motion` drives `flush()` from the `Clock` port. The dirty set that currently grows forever
   now drains every frame.
5. **Delete `Overlay`.** It is an output-role observation edge with a different name and a
   promise-based API. Migrate `useSpiralWaveController` to observation edges — which
   `useGraphSpiralController` already proves works for the identical effect. One mechanism.

**Tests.** Re-run Phase 0's compose-count benchmark. **Ship the number in the PR body.** Expect
an order of magnitude on a deep multi-subscriber scene; if it is not at least 3×, stop and find
out why before merging. Assert the dirty set is empty after a flush. Assert both spiral demos
are visually identical.

**Exit.** Exactly one call site of `Track.compose` outside tests. Benchmark improvement
recorded.

**Blast radius.** `GraphPublisher.js`, `Motion.js`, `Track.js`, `useMotionSubscribers.js`,
`useMotionSubscriber.js`, `Overlay.js` (deleted), both spiral controllers.

---

## Phase 7 — Engine diet

**Why.** `Engine` currently does five jobs: project loading, instance registry, motion assembly,
composite factory, and lookup. Phase 2 already took the factory. Assembly is the one that
matters — `#mountMotion` normalizes a graph, creates tracks, wires observations, builds a
publisher and a binding, and inits a motion. That is a use case, not an engine method, and it is
why the orphan binding in Fault #4 could hide there.

**What.**

1. Extract `usecases/assembleMotion.js`. `Engine.mountInstance` becomes: look up config, call
   the use case, register the result.
2. Replace `getTrack()`'s linear scan + duck-type (`typeof object.progress === "function"`)
   with typed registries. Post-Phase-4 that predicate matches `Motion` too, so today's
   implementation would return a composite from a method named `getTrack`.
3. `Engine` keeps: dependency graph, project lifecycle, instance ownership. Nothing else.

**Tests.** Assembly is unit-testable without an `Engine`. Lookup returns the declared type.

**Exit.** `Engine.js` under ~120 lines. No duck-typed lookups.

---

## Phase 8 — Public surface and docs

**Why.** `packages/core/src/index.js` exports `GraphPublisher`, `GraphBinding`,
`buildTrackTween`, `composePatch`, `mergePatches`, `observationEdgeKey` — internals — while
**not exporting `Track`, `Motion`, or `Engine`.** Consumers therefore deep-import
(`@motionpath/core/engines/Engine`, `@motionpath/core/lib/gsapTickerClock.js`), which is exactly
what the v4.1 plan's Phase 11 set out to prevent. The barrel is inverted.

**What.** Export the object model, hide the machinery. Add `exports` map entries that block deep
imports into `lib/` and `usecases/`. Rewrite `ARCHITECTURE.md` around the new model. One ADR per
irreversible decision in this plan (recursive composition; two ports; publisher as the single
compose path; `Overlay` deletion).

---

## Phase 9 — Tween collapse, *if* it is real

**Why deferred to last.** The prior plan was right about this one and I am keeping its reasoning
intact: 3 GSAP objects → 2 per leaf member depends on unverified GSAP behavior, and its cost
(rewiring notify onto `onUpdate`) collides with Phase 3 and Phase 6. After Phase 3 the whole
question lives inside `GsapScheduler` and is a contained adapter change instead of a
cross-cutting one. After Phase 6 the per-frame cost is dominated by compose, not by tween count,
so the win may have evaporated on its own.

**Gate.** Isolated repro script, then a measured number. No number, no PR.

---

# Part 5 — Sequencing, rejections, risk

## 5.1 Order and why it is this order

```text
0  Characterization + boundary tightening      no dependencies
1  Validator, DI, dead code, schema rename     small, unblocks mountWithDelegate
2  One composite                               MUST precede ports (one client shape)
3  Ports                                       MUST precede recursion (needs nestable Scheduler)
4  Recursive composition                       grandchild bug dies here. Spike first.
5  Graph off Track                             needs Phase 4's topology removal
6  One compose path                            needs Clock port (3) + graph owner (5)
7  Engine diet                                 cleanup, needs 2 and 6
8  Public surface + docs                       last, describes the finished thing
9  Tween collapse                              optional, gated on a measurement
```

The two hard ordering constraints: **2 before 3** (design ports against one client, not three)
and **3 before 4** (recursion needs a port that nests). Everything else has slack.

## 5.2 How this differs from the plan it replaces

The prior plan's rejections were all correct and are all preserved. Its sequencing instinct
(small unblockers first, risky measurement last) was correct and is preserved. Four changes:

| Prior plan | This plan | Why |
|---|---|---|
| `Progressable` fixes the grandchild bug "by construction" | Only recursive composition fixes it (Phase 4) | The bug is in `_mountChild` writing a relative offset as absolute. An interface doesn't touch that. |
| One `TrackSlot` quarantines GSAP | Two ports: `Interpolator` + `Scheduler` | The leaf holds a GSAP tween too. One port relocates the dependency; two remove it. |
| `TrackGroup`→`Motion` is a rename, do it 4th | It's a triplicate deletion + a lifecycle bug fix, do it 2nd | `createGroupHost` is a third composite that both demos use. `init()` twice silently empties the Motion. |
| Tween collapse is the main perf item | The dark publisher is (Phase 6) | Per-frame cost is O(subscribers × depth) composes with no cache. Tween count is second-order. |

Plus three items the prior plan didn't have visibility into: the orphaned `GraphBinding`, the
two-and-a-half compose paths (`Overlay` being the half), and the inverted public barrel.

## 5.3 Explicitly not doing

Carried over from the prior plan, all still correct:

- **Not eliminating standalone tracks.** TowerDefense proves standalone-by-design is a
  permanent category.
- **Not making the scheduler slot the external handle.** Inverts domain and infrastructure for
  zero new capability.
- **No inheritance between leaf and composite in either direction.** False is-a both ways.
  `Progressable` is a shared contract, not a base class.
- **Not unifying the observation graph with the topology tree.** Many-to-many DAG vs. tree.
  Collapsing them relocates complexity.
- **Not building a speculative second adapter.** The seam is the deliverable. A CSS or Flutter
  adapter is not a task until something needs one — but note that the fake-backed test suite in
  Phase 3 *is* the proof the seam works, and it costs almost nothing.

Added:

- **Not migrating to TypeScript inside this plan.** v4.1 Phase 10 proposed it. Doing it during
  a structural refactor doubles the diff and halves the reviewability. Land v5, then migrate
  the stable model.
- **Not touching `GaplessLayoutDelegate`.** It's correct, and its comments explain two failure
  modes it already avoids. Phase 4 changes how its output is *consumed*, not the delegate.

## 5.4 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Nested GSAP timelines change reflow/render semantics | High | High | Phase 4 spike is a hard gate. Characterization tests from Phase 0. |
| Phase 2 visually regresses the spiral demos | Medium | High | Screenshot before/after. Phase 2 ships alone. |
| Phase 6 changes frame timing (dirty-flush vs. inline notify) | Medium | Medium | Benchmark both directions; assert a full flush per tick; keep the inline path behind a flag for one release. |
| Phase 5 is a large mechanical diff, review fatigue | High | Low | Pure move, no logic change. Assert identical test bodies where possible. |
| Scope creep into TypeScript or new features | High | Medium | Explicitly out of scope above. One phase per PR. |
| Grandchild fix reveals demos that depended on the flat behavior | Low | Medium | Grep for depth ≥ 2 usage before Phase 4. Currently only TowerDefense is a candidate. |

## 5.5 Definition of done for v5

- `Track` is a leaf: one role, ~7 fields, no topology, no observation API, no playback.
- Exactly one composite class. `TrackGroup`, `createGroupHost`, and `AutonomousTimelineControls`
  do not exist.
- Nesting is recursive to arbitrary depth; the Phase 0 grandchild and orphan tests are green.
- No `gsap` import outside `packages/core/src/adapters/`.
- The full `Track`/`Motion` suite passes against fake ports with no GSAP loaded.
- Exactly one compose path, driven by one flush per clock tick, with a recorded benchmark
  improvement over the Phase 0 baseline.
- `Overlay` does not exist; entrance/exit are observation edges in both demos.
- `packages/core/src/index.js` exports the object model, not the machinery; deep imports are
  blocked by the exports map.
- Both spiral demos, TowerDefense, and Walker are visually unchanged throughout.

---

# Appendix — Evidence index

Every claim in Part 2, with its source. All references are to `feat/graph-spiral-demo`.

| # | Claim | Where |
|---|---|---|
| 2.1 | `Track` holds 20 private fields, ~33 public members, 5 roles | `packages/core/src/lib/Track.js` |
| 2.1 | `#staggerOffset` written in `addChild`, read nowhere | `Track.js` |
| 2.2 | Relative offset written as absolute master position | `Track.addChild` → `TrackGroup.mount` |
| 2.2 | All descendants share one `TrackGroup` as `#host` | `TrackGroup.mount` → `track._mount(this)` |
| 2.2 | Depth 1 correct only because host mounts at 0 | `Engine.createGroupHost`: `group.mount(hostTrack, 0)` |
| 2.2 | `unmount` removes one proxy, not a subtree | `TrackGroup.unmount` |
| 2.2 | `destroy()` nulls `#host` without unmounting | `Track.destroy` |
| 2.3 | Three composites | `TrackGroup`, `Motion`, `Engine.createGroupHost` |
| 2.3 | Second `init()` yields an empty Motion | `Motion.init` calls `destroy()`, which clears `#initialTracks` |
| 2.3 | Re-`init()` builds on a destroyed delegate | `Motion.destroy` → `#triggerDelegate.destroy()` |
| 2.3 | Four near-identical delegate control blocks | `TriggerDelegate.js` |
| 2.4 | Publisher wired to a no-op | `Engine.#mountMotion`: `publish: () => {}` |
| 2.4 | `GraphBinding` constructed and dropped | `Engine.#mountMotion`, no `setGraphBinding` on success |
| 2.4 | React composes per subscriber with no shared `ctx` | `useMotionSubscribers.subscribeToSource`: `targetTrack.compose(data)` |
| 2.4 | Dirty set grows with no consumer | `Track.progress` → `#invalidate` → `markDirty`; no `flush()` in the Engine path |
| 2.4 | `Overlay` duplicates output-role edges | `Overlay.js` vs. `useGraphSpiralController.makeGraphBall` |
| 2.5 | Boundary test checks React and JSX only | `architecture-boundary.test.js` `forbidden` |
| 2.5 | Seven core modules import gsap; two are adapters | `Motion.js`, `Engine.js`, `TriggerDelegate.js`, `BuildTrackTween.js`, `gsapTickerClock.js`, `adapters/gsapPlatform.js`, `adapters/domRenderer.js` |
| 2.5 | Leaf holds a raw GSAP tween | `createTrack` → `buildTrackTweenSync` → `Track#interpolationTimeline` |
| 2.5 | GSAP detail leaks into the snapshot contract | `Track.getSnapshot`: `const { _gsap, ...rest }` |
| 2.5 | Scheduling relies on GSAP calling function-valued props | `TrackGroup.mount`: `gsap.to(track, { progress: 1 })` |
| 5.2 | Public barrel exports internals, omits the model | `packages/core/src/index.js` |
| 5.2 | Consumers deep-import as a result | `useSpiralWaveController`, `useGraphSpiralController` |
