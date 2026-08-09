# MotionPath v5 pass-2 implementation review

**Reviewed:** 2026-08-08 21:10 Asia/Jakarta  
**Scope:** every pass-2 change from P2-00 to now, PRs #116 through #140  
**Base inspected:** `v5` at `9b200dc`, plus open PR #140 head `1935c21`  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md), pass-2 revision A  
**Control sheet:** [`V5-PASS-2-COMPLETION-MATRIX.md`](./V5-PASS-2-COMPLETION-MATRIX.md)

## Method and limits

Read directly: `Track.js`, `createTrack.js`, `Motion.js`, `Engine.js`, `GraphBinding.js`, `GraphPublisher.js`, `ObservationState.js`, `ObservationStateBridge.js`, `StandaloneObservationAdapter.js`, `TrackObservationOwner.js` (#140), `GraphRuntime.js`, `ProjectRuntime.js`, `contract/immutableValue.js`, `scripts/v5-pass2-boundaries.mjs`, `scripts/v5-gsap-allowlist.mjs`, `gsap-boundary.test.js`, `architecture-boundary.test.js`, the Track ownership grep suites, `package.json`, and `.github/workflows/ci.yml`. Also read the merged PR file lists and the check-run results for #139 and #140.

Not done: no local test, benchmark, or build run. Every claim below is a source-level or configuration-level claim, verifiable by reading the cited file. Nothing here is inferred from PR titles or from the previous status docs, which were themselves a session stale.

## Verdict

The direction is right and several pass-2 slices are genuinely good work. The problem is that **the evidence system is weaker than the architecture work it is supposed to gate**, and P2-03 has drifted into a dual-ownership state that is more fragile than what it replaced.

Three things matter most:

1. `ObservationState` is not the authority it is documented to be. `ObservationStateBridge` derives it from `Track.observedEdges` and `GraphBinding` rebuilds it from Track on every commit. Track is still the source of truth.
2. #139 gave every standalone Track its **own** adapter, which directly reverses a decision recorded in `V5-STATUS.md`, and left Track holding a second copy of the observation bookkeeping.
3. "7 of 7 checks green" means less than it sounds. The format gate checks two files, the pass-2 boundary scan is not in CI at all, and two of the seven jobs cannot fail.

Severity counts: **6 high**, **10 medium**, **6 low**.

## Findings

### Ownership drift

#### F-01 (High): ObservationState is derived from Track, not authoritative over it

`ObservationStateBridge.syncFromTracks()` builds state by iterating `track.observedEdges`, and `GraphBinding.#refreshObservationBridge()` destroys and reconstructs the bridge after every commit and every failed transaction. So the normalized model is a projection of the live Track wiring, in the exact direction the target architecture forbids.

This also means the symbol-ban is larger than #140's list implies. `Track.observedEdges` currently has five consumers that need a replacement source before it can be deleted:

- `ObservationStateBridge.syncFromTracks()` and `assertParity()`
- `GraphBinding.#assertTrackGraphMatches()`
- `GraphBinding.addEdge/removeEdge/replaceEdge`, which read `observer.observedEdges` to capture the previous edge for rollback
- `GraphPublisher.#graphGuard`, which walks `current.observedEdges` for cycle detection

**Action:** invert the bridge before deleting anything. State becomes the writer, Track becomes a reader, and the four consumers above read `observationState.getEdges(id)`. Until that inversion lands, the matrix row "ObservationGraph owns graph state" should read as partial.

#### F-02 (High): per-Track standalone adapters reverse a recorded decision

`V5-STATUS.md` records: *"A standalone adapter must be shared across related Tracks. Creating an isolated adapter per Track makes valid cross-track edges look unknown."* #139 then made both `createTrack` and the `Track` constructor create `new StandaloneObservationAdapter()` per Track when `mode === "standalone"`, and deleted the comment that explained why they must not. `Engine.mountInstance`, `Engine.createTrackInstance`, and `Engine.createMotionHost` all take that path.

The "unknown track" failure is avoided by having `setObserved`/`compose` auto-register both endpoints, which means the **observer's** adapter becomes the de-facto owner of the edge while the **source's** own adapter keeps an empty view of its own observers. Consequences visible in the source:

- `adapter.state.getObserverIds(sourceId)` is empty on the source's own adapter and correct on the observer's.
- `#watchTrack` reports observers by `splice`-ing the caller's `event.observerIds` array in place. With two adapters subscribed to the same Track, the reported set depends on `Set` iteration order of `#destroySubscribers`. The correct answer wins today only because the observer's adapter subscribed second.
- `ObservationState.register` throws `Duplicate track id` when a different instance reuses an id, so reload paths that recreate a Track with a stable id can now throw from inside a compose call.

**Action:** decide the ownership scope explicitly, one adapter per Motion or per ProjectRuntime, and inject it. Then delete the in-place `splice` return channel in favor of a returned value.

#### F-03 (High): Track keeps a second copy of the observation bookkeeping

In adapter mode `Track.setObserved` writes to the adapter **and** to `#observed`, and calls `track._addObserver`. `removeObserved` removes from the adapter and then calls `#removeObservedKey`, which removes from the adapter again. Readers disagree: `observedSources` and `observedEdges` read the adapter, while `observerCount` and `observerIds` read Track's own `#observers`. Two writers, split readers, one fact.

#140's symbol list includes `observerCount` and `observerIds` but the doc does not note that they have no adapter-backed replacement wired yet, even though `ObservationState.getObserverIds` exists.

**Action:** point `observerCount`/`observerIds` at the adapter first, prove equivalence, then delete `#observed`/`#observers`. Removing the mutators before the readers move will silently return empty observer sets during teardown.

#### F-04 (High): destroy is no longer re-entrancy safe

#139 moved the destroy-subscriber notification **above** `this.#destroyed = true` in `Track.destroy()`. `GraphBinding.#subscribeTrack` reacts to `onSourceDestroyed` with `this.removeTrack(event.id)`, whose default is `{ destroy: true }` and which checks `!track.isDestroyed`. That check now passes, so `track.destroy()` is called re-entrantly from inside the first `destroy()`.

The nested call runs the whole body: it detaches edges, sets the flag, destroys children, and emits `destroyed`. Control then returns to the outer call, which emits `destroyed` a second time (`#emitLifecycle` deliberately allows that type after teardown) and kills the interpolation timeline a second time. It survives only because `#lifecycleSubscribers` was already cleared and `#tracks.has(id)` is false on the second pass.

**Action:** add a `#destroying` guard set on entry, or restore notification order. This is a two-line fix and it should land before any further P2-03 deletion, because every removal slice touches this path.

#### F-05 (Medium): GraphBinding registers the wrong unsubscriber

```js
const unsubscribeDestroyed = track.onSourceDestroyed?.(...);
if (unsubscribeDestroyed) this.#unsubscribers.push(unsubscribe); // wrong variable
```

The lifecycle unsubscriber is pushed twice and the source-destroyed listener is never unsubscribed. A destroyed `GraphBinding` keeps a live listener on every Track it ever held, which is both a leak and a route back into a torn-down binding. One-line fix, and it sits directly under the P2-07 "leak-free" gate.

#### F-06 (Medium): replaceObserved has two divergent code paths

The adapter branch calls `adapter.replaceObserved` and then performs manual `#observed` surgery, emitting an explicit `edge-removed` plus `edge-added` pair per edge. The legacy branch instead re-runs `#removeObservedKey` and `setObserved` over the same edges it already rewrote, so `setObserved` emits its own events on top. The two modes therefore produce different lifecycle event sequences and different invalidation counts for the same logical operation, which makes any event-count assertion mode-dependent and makes publisher dirty-marking mode-dependent too.

#### F-07 (Medium): one invariant, three cycle validators

Cycle rejection now exists in `normalizeObservationGraph` (topological sort, authored graphs), `ObservationState.#assertAcyclic` (BFS), and `GraphPublisher.#graphGuard` (BFS over `Track.observedEdges`). Three implementations of a non-negotiable rule, one of them reading the surface P2-03 is deleting. Collapse to one, owned by `ObservationState`, with the publisher delegating.

#### F-08 (Medium): TrackObservationOwner in #140 is an empty layer

`TrackObservationOwner` forwards eleven members to `ObservationState` and adds no behavior. It also introduces a self-referencing construction pattern: the `composeSource` callback passed into the constructor reads `this.#owner`, the field being assigned. It works because the closure is deferred, but it is a trap for the next reader. The call chain becomes Track to Adapter to Owner to State, four hops for one edge lookup.

**Action:** either give the owner the responsibilities the symbol-ban removes from Track (observer counts, lifecycle subscription, destroy ordering), which would justify it, or drop it and let the adapter use `ObservationState` directly.

### Hot path and cost

#### F-09 (Medium): compose reallocates every edge on every pass

`ObservationState.getEdges` returns `[...bucket.values()].map((edge) => ({ ...edge }))`. `compose` calls it twice per node (input pass, output pass) and `#assertAcyclic` calls it once per visited node per mutation. PR-21 measured and indexed downstream invalidation; pass-2 then put per-tick allocation back into the same path, and no benchmark covers the `ObservationState` compose path.

#### F-10 (Medium): every commit rebuilds the whole observation model

`GraphBinding.#commit` calls `#refreshObservationBridge()`, which destroys the bridge, constructs a new `ObservationState`, and re-reads every Track's edges. That runs on every single edge add, remove, replace, and every track add or remove, and it discards any state the adapter held. `removeTrack` also calls `state.unregister(id)` immediately before the rebuild that would have handled it.

### Gate integrity

This section is the one I would act on first, because it is why the drift above landed on green checks.

#### F-11 (High): the format gate checks two files, and there is no linter

CI runs `npm run format:check:ci`, which is `prettier --check package.json .github/workflows/ci.yml`. The full `format:check` script exists but CI does not call it, there is no `.prettierignore`, and there is no ESLint anywhere in the repo.

That is how #139 landed `Track.js` and `GraphPublisher.js` rewritten from readable multi-line code into single-line dense code with the explanatory comments deleted, on a fully green gate. `GraphPublisher.js` alone lost 282 lines that were mostly the recorded reasoning for its atomicity rules, including the notes on why the registry is copied defensively, why `removeTrack` stays a no-op after disposal, and why membership is checked in both directions. `#normalizeRetry`'s three specific error messages were collapsed into `"invalid retry configuration"` and `#assertAlive` changed from `"GraphPublisher is destroyed."` to `"GraphPublisher destroyed"`.

**Action:** point CI at `format:check`, or add ESLint with a max-statements-per-line rule, and restore the deleted reasoning comments in both files. A refactor that deletes the recorded reasons for its own invariants is how those invariants get broken next quarter.

#### F-12 (High): the pass-2 boundary scan does not run in CI

`npm run boundary:v5:pass2` appears in the audit doc's command list and nowhere in `.github/workflows/ci.yml`. `--strict`, described as the completion gate, runs nowhere at all. The GSAP half of the boundary is genuinely enforced, but by `packages/core/src/gsap-boundary.test.js` under vitest, not by the script. The audit doc's three-tier "enforced" table therefore describes a script no automation executes.

#### F-13 (Medium): two of the seven checks cannot fail

`rig graph benchmark` and `v5 baseline report` are both `continue-on-error: true`. The real blocking gate is five jobs: format (two files), unit tests, typecheck, build, pack dry run. Neither benchmark has a regression threshold, so performance is recorded but never gated. Status docs should stop describing 7 of 7 as the complete gate without that caveat.

#### F-14 (Medium): the scan's Track regex misses half the symbol-ban

`scripts/v5-pass2-boundaries.mjs` matches only `setObserved|removeObserved|replaceObserved|observedEdges|observedSources|_setGraphGuard`. It does not match `#observed`, `#observers`, `observerCount`, `observerIds`, or `_setObservationComposer`. #140's evidence item 8, "the strict boundary scan reports no Track observation ownership symbols", can therefore go green while the reverse registry and both observer queries remain in place. The scan also only walks `packages/core/src`, so `packages/react` is unchecked.

#### F-15 (Medium): two P2-04 evidence suites are overlapping inverted greps

`Track.ownership-boundary.test.js` (#122) and `Track.topology-ownership.test.js` (#132) both assert that Track **still contains** `addChild`, `removeChild`, `_attachGroupHost`, and friends, by string-matching the source file. They overlap almost entirely, they assert text rather than behavior, they are counted as two separate matrix evidence entries, and the work they gate must delete them. The plan's actual P2-04 gate, "a repository symbol-ban test proves Track cannot regain child/group-host APIs", does not exist yet.

### Documentation drift

#### F-16 (Medium): quarantine count is wrong in three docs

`V5-STATUS.md`, `V5-PASS-2-COMPLETION-MATRIX.md`, and `V5-PASS-2-BOUNDARY-AUDIT.md` all say five quarantined GSAP imports remain. `scripts/v5-gsap-allowlist.mjs` lists **ten**: nine tests and one fixture. Fixed in this change. Since the list may only shrink, its length is a progress metric and should be quoted from the file, not restated from memory.

#### F-17 (Low): Motion's explicit child-slot API has no callers

#129 added `mountChild`, `unmountChild`, and `reflowChild` and kept `_mountChild`, `_unmountChild`, and `_reflowChild` as aliases. `Track.js` still calls the underscored ones exclusively, so the "explicit composite ownership API" is currently an unused alias layer plus a test asserting the methods exist.

#### F-18 (Low): composition parity is test-only

`ObservationStateBridge.assertCompositionParity()` is the sharpest piece of reasoning in the pass, and nothing in the production path calls it. `#wireInitialEdges` calls only `assertParity()`, the edge-set check that the comment above `assertCompositionParity` explicitly says is insufficient. Either call it behind a debug flag on commit or state plainly in the matrix that the evidence is suite-only.

#### F-19 (Low): four names and two systems for the rollout switch

`Engine.#publisherRendering`, `GraphRuntime.enabled`, `GraphRuntime.usePublisher`, and `Motion.usePublisherRendering` all describe one decision, while `ProjectRuntime.capabilities` is a separate frozen-at-construction system for `crossMotion` and `freeTracks`. `Engine.publisherRendering` also has a public setter that has no effect on already-mounted Motions. P2-05's "documented rollback switch" has no implementation behind it yet.

#### F-20 (Medium): the two rendering paths deliver different payload shapes

`Motion.subscribe` delivers a Track **snapshot** in compatibility mode and a published **patch** in publisher mode. That is a consumer-visible contract change hiding behind a default flag. P2-05's equivalence evidence must cover payload shape and subscription timing, not just composed values, or flipping the default breaks subscribers that pass equivalence on paper.

#### F-21 (Low): the default path builds a publisher to use it as a validator

In `Engine.#mountMotion`, the non-publisher branch constructs `new GraphPublisher({ graph, tracks, publish: () => {} })` purely so `GraphBinding` has something to validate against. A full publish pipeline instantiated as a side effect of validation, with a no-op sink, is worth extracting into an explicit graph validator.

#### F-22 (Low): authored mapFn policy lives in the Engine

`Engine.#mountMotion` defines the authored edge semantics inline: input role becomes `(patch) => ({ [edge.target]: patch || {} })`, output role becomes identity. Any other construction site for `initialEdges`, and `GraphRuntime` accepts them too, has to re-derive that policy. It belongs next to the graph normalizer.

## What is solid

Not everything here is a problem, and the good parts should survive the cleanup:

- `contract/immutableValue.js` is the best module in the pass. Clone-then-freeze rather than freeze-in-place, a documented foreign-reference rule, and a `seen` map that preserves shared identity and terminates cycles. The reasoning for each choice is written down.
- The GSAP boundary is real. A blocking vitest check, a shrink-only allowlist shared with the audit script, and a stale-entry failure so the list cannot rot. The docs also correctly refuse to claim core is GSAP-free.
- `GraphPublisher`'s prepare-then-commit split, two-way membership validation, and the separation of retry state from invalidation are all correct and were correctly explained, before #139 deleted the explanations.
- `assertCompositionParity`'s premise, that an identical edge set is not evidence of identical behavior, caught a real merge-semantics divergence and is the right standard for the rest of P2-03.
- The docs' habit of stating what is explicitly **not** claimed is rare and worth keeping.

## Recommended sequence

**Before merging #140**

1. F-05, the one-line unsubscriber bug.
2. F-04, the destroy re-entrancy guard.
3. F-11 and F-12, point CI at `format:check` and add `boundary:v5:pass2` as a job. Restore the reasoning comments deleted from `Track.js` and `GraphPublisher.js`.
4. F-14, widen the scan's Track symbol list to match #140's ban list.

**Then, as the real P2-03 removal design**

5. F-02, decide and inject the standalone adapter scope. This is a prerequisite, not a cleanup.
6. F-01, invert the bridge so state writes and Track reads, and migrate the four `observedEdges` consumers.
7. F-03, move `observerCount`/`observerIds` onto the adapter, prove equivalence, then delete `#observed`/`#observers`.
8. F-06 and F-07, collapse the duplicate mutation paths and the three cycle validators.
9. F-08, justify or delete `TrackObservationOwner`.

**Before P2-05 flips any default**

10. F-20, payload-shape equivalence.
11. F-19, one flag with a real rollback path.
12. F-13, benchmark thresholds so the publisher path cannot regress silently.

**P2-06 cleanup candidates**

F-15 (replace inverted greps with a real symbol-ban), F-17 (migrate Track to the named Motion API and drop the aliases), F-21, F-22, and the `lib/gsapTickerClock.js` shim, which is correctly documented as deletion-candidate work.

## Verification commands

```text
npm ci
npm run format:check                 # currently NOT what CI runs
npm test
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2            # currently NOT in CI
node scripts/v5-pass2-boundaries.mjs --strict
```

Findings in this document are source-level and reproducible by reading the cited files at `9b200dc` and at #140 head `1935c21`. Each finding needs an owner and a work package before P2-06 begins.
