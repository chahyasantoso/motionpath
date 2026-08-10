# PR-19b: the publisher sink

**Owns:** implementation-review finding #2, and the unmet half of Checkpoint D (PR-16).  
**Base:** `v5`  
**Branch:** `v5-pr-19b-publisher-sink`

## The bug

`Engine.#mountMotion` built the production publisher like this:

```js
publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} });
```

`publish` is the delivery callback `GraphPublisher.flush()` invokes for every node whose state changed. In the live mount path it did nothing. Every mounted motion composed its graph in dependency order, cached the results, incremented its published counter, and dropped the output on the floor.

Nothing else closed the loop either. `Engine` imported `ProjectRuntime` and nothing else from `runtime/`: no `PatchRegistry`, no `GraphRuntime`, no clock. `GraphPublisher.flush()` had no caller anywhere in the mount path, so in production it was never even reached.

The consequence is narrow and total. Everything PR-17 through PR-19 built (qualified IDs, staged membership, capability gates, reference validation) is real and tested, but all of it governs a graph whose output had nowhere to go. The PR-16 merge gate, _same-motion rendering is publisher-backed_, was unimplemented, so Checkpoint D could not pass, and Checkpoints E and F were certified above it.

## The fix

### 1. A real sink, gated off

`Engine` gains `publisherRendering`. Strict `=== true`, matching the cross-motion capability gates: `undefined`, absent, `"true"`, `1` all resolve to disabled.

- **Off (default):** unchanged. Same `GraphPublisher` with the same no-op publish, same `GraphBinding`, same ownership chain. The legacy path stays authoritative, which is the rollback posture the implementation plan requires.
- **On:** the mount path builds a `GraphRuntime` instead. That type already existed and already did the right thing (real publish into a `PatchRegistry`, one flush per clock tick, batched notification). It was simply never constructed by anything that ships. Motion owns it through `setGraphRuntime`, the same ownership shape as `setGraphBinding`, one level up.

Reassigning the flag affects only motions mounted afterwards. It never reaches into a live Motion and swaps its composition path underneath a renderer mid-frame.

### 2. Start order is the "no partial graph" rule

The runtime is constructed **without** a clock and started only after `motion.init()` and registration have both succeeded:

```js
motion.init();
this.#register(motion, "motion");
runtime?.start(this.#resolveClock());
```

A mount that dies at `delegate.build()` is torn down before the runtime was ever subscribed to a tick. There is no window in which a half-built motion can flush. `Engine.publisher-sink.test.js` asserts the clock has zero listeners after a failed mount.

### 3. First-frame publication

`GraphRuntime.start()` now calls `markAllDirty()` before subscribing.

This is not a convenience. A patch is published only when a node's state changed, so a runtime starting against a paused or not-yet-played timeline would compose to fill its cache, conclude nothing changed, and publish nothing. Any renderer subscribing at mount would have no patch to draw, waiting on an invalidation that for a paused timeline never arrives. Seeding one full pass makes "subscribed" and "has something to render" the same state.

### 4. A flush failure must not kill the ticker

Clock-driven flush now records a `GRAPH_FLUSH_FAILED` diagnostic instead of throwing. A direct `flush()` still throws, because a caller that asked for a flush wants the failure.

This only became a hazard once the path actually ran: one track whose plugin throws would otherwise raise once per frame, forever, from inside GSAP's tick loop. `GraphPublisher` already isolates the failure (the node is blocked, its dependents are held back, its siblings still publish), so re-raising into the ticker adds no information and takes the page down with it. The diagnostics buffer is capped at 50, because an unbounded array appended to at 60fps is a memory leak with a slow fuse.

This is also the first code to write to `#diagnostics`, which was declared and exposed but never populated.

### 5. One ticker subscription

`createTickClock` does two jobs. It normalizes shape (`gsapTickerClock` emits a bare delta number for its existing demo callers, while `GraphRuntime.start` destructures `{ tick }`, and destructuring a number silently yields `undefined` rather than failing) and it multiplexes, so twenty mounted motions add exactly one GSAP ticker callback. The upstream subscription is released when the last listener leaves and re-attached if one returns, which is what makes a clock safe to hold across a project reload. Tick numbers stay monotonic across that cycle because `GraphPublisher` schedules retry backoff against them.

### 6. React reads patches

`useMotionSubscribers` prefers the published patch when the instance is publisher-backed, and falls back to the Track path otherwise: for standalone tracks, for motions mounted with the gate off, and for any instance predating the runtime. Additive, not a switch.

Two details that were easy to get wrong:

- `patch.values` is deep-frozen (PR #89). `applyAnchor` and `domRenderer` both treat what they receive as theirs to touch, and mutating a frozen object throws in a module. Subscribers get a copy.
- `compose` keeps its meaning. Called with no argument it returns the published values, which is free. Called with custom raw data it genuinely recomposes, because that is what passing data asks for.

Adding `subscribe`/`compose` to `Motion` also changed which branch of the hook a plain Motion lands in, so `Motion.subscribe` is total: runtime when publisher-backed, Track when not, no-op unsubscribe when the id resolves to nothing. That last case used to be a silent no-op because Motion had no `subscribe` at all, and the dynamic demos reference ids for tracks that have not spawned yet.

### 7. One hot-path allocation removed

`GraphBinding.getTrack(id)`. The publish callback needs one track per published node per frame, and the `tracks` getter clones the entire registry on every read. The getter still clones (nothing may mutate the binding's registry behind its back), but reading a single entry no longer does.

## Evidence

The two PR-16 CI requirements that had no committed suite now do.

`packages/core/src/runtime/__tests__/PublisherEvidence.test.js`

| Claim                          | Assertion                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Compose once per node per tick | Diamond `a -> {b,c} -> d`: exactly `{a:1, b:1, c:1, d:1}` after one tick. A shared ancestor feeding two edges composes once.        |
| No work when clean             | Chain of 4: 4 composes on the first tick, still 4 after two further ticks, 8 after one invalidation.                                |
| One flush per tick             | A subscriber that re-enters `flush()` is refused, not queued.                                                                       |
| Subscriber scaling             | 1, 10 and 50 subscribers on a 4-node chain: composes stay `[4, 4, 4]`, deliveries are `[1, 10, 50]`.                                |
| Shared instance                | All 5 subscribers receive the identical frozen patch object, not 5 copies.                                                          |
| Cost replaced                  | The legacy per-subscriber path on the same fixture: 10 subscribers x 4 chain nodes = 40 composes.                                   |
| Failure isolation              | A throwing plugin blocks its own node, leaves the upstream patch published, records a diagnostic, and never throws into the ticker. |
| Clock hygiene                  | Dispose detaches; ticking afterwards is inert.                                                                                      |

`packages/core/src/engines/__tests__/Engine.publisher-sink.test.js` covers the gate (off by default, literal-`true` only, no hot-swap of a mounted motion), delivery (patches on tick, immediate emit to a late subscriber, compose equivalence, revision advance), the no-partial-graph ordering, and lifecycle (destroy, repeat destroy, engine unmount, repeat `init()`, project reload, and refusing to attach a runtime to a destroyed Motion).

These suites are committed but **have not been executed in this session**. CI is the evidence, not this document. Checkpoint D moves to passed only on a green run.

## What this does not do

- **The gate stays off.** Nothing renders through the publisher by default. Turning it on for the demos is a separate, measured decision.
- **`PatchRegistry` snapshotting is untouched.** Building `sourceRevisions` still snapshots every patch on every publish, which is O(N) per node per frame. The 2026-08-07 review called this out and assigned it to PR-21 under measurement. It is not optimized here, on purpose.
- **Per-motion registries.** Each motion gets its own `PatchRegistry`, because bare track IDs are motion-local. Cross-motion patch lookup belongs with the qualified-ID work, not here.
- **`docs/API-REFERENCE.md` is not updated.** PR-20 owns the exports map and the public API boundary; documenting `publisherRendering`, `Motion.subscribe` and `createTickClock` as public before that PR decides what is public would be writing the same doc twice.
