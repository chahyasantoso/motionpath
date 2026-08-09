# Pass-2 review resolution log

**Tracks:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Branch:** `v5-pass-2-p2-03-track-symbol-ban`, PR #140  
**Updated:** 2026-08-09 07:16 Asia/Jakarta

One row per finding. A finding is **closed** only when the fix is on the branch and the gate that would catch a regression exists. "Deferred" means it has an owner and a work package, not that it was dismissed.

| ID | Severity | Status | Where |
|---|---|---|---|
| F-01 ObservationState derived from Track | High | Open, blocks the symbol-ban | P2-03 removal design |
| F-02 per-Track standalone adapters | High | Open, blocks the symbol-ban | P2-03 removal design |
| F-03 duplicate observation bookkeeping | High | Open, documented in `Track.js` | P2-03 removal design |
| F-04 destroy re-entrancy | High | **Closed** | `Track.js` `#destroying` guard |
| F-05 wrong unsubscriber pushed | Medium | **Closed** | `GraphBinding.#subscribeTrack` |
| F-06 divergent replaceObserved paths | Medium | Open, divergence documented in place | P2-03 |
| F-07 three cycle validators | Medium | Open, noted at all three sites | P2-03 |
| F-08 TrackObservationOwner is an empty layer | Medium | Partly addressed: constructor self-reference trap removed, probation recorded | P2-03 |
| F-09 compose reallocates every edge | Medium | Open | P2-05 benchmarks |
| F-10 every commit rebuilds the model | Medium | Open | P2-03 |
| F-11 format gate checks two files, no linter | High | **Closed** for the regression it describes | readability gate + comments restored |
| F-12 boundary scan not in CI | High | **Closed** | `boundary-scan` job |
| F-13 two checks cannot fail | Medium | Open by design, now stated everywhere | P2-05 thresholds |
| F-14 scan misses half the ban list | Medium | **Closed** | scan symbol table + react surface |
| F-15 inverted grep evidence suites | Medium | Open | P2-04 |
| F-16 quarantine count wrong in three docs | Medium | **Closed** | docs corrected to ten |
| F-17 Motion child API has no callers | Low | Open, noted in `Track.js` | P2-04 |
| F-18 composition parity is test-only | Low | Open | P2-03 |
| F-19 four names for one flag | Low | Open | P2-05 |
| F-20 two paths, different payload shapes | Medium | Open | P2-05 |
| F-21 publisher built as a validator | Low | Open | P2-06 |
| F-22 authored mapFn policy in the Engine | Low | Open | P2-06 |

Closed: 6. Open: 16, all with a package.

## What landed for each closed finding

### F-04, destroy re-entrancy

`Track` gained a `#destroying` flag set on entry to `destroy()`. The destroy-subscriber notification stays where it is, before `#destroyed` flips, so listeners can still read `observerIds` while the Track reports itself alive; the guard closes the re-entry window that `GraphBinding.removeTrack` opened. The teardown ordering and the reason for it are now written into the method.

### F-05, wrong unsubscriber

`#subscribeTrack` pushed `unsubscribe` where it meant `unsubscribeDestroyed`, so the lifecycle teardown was retained twice and the source-destroyed listener was never released. Both are retained now, with the leak recorded above the method.

### F-11, readability gate

Two parts.

**Reasoning restored.** `GraphPublisher.js` is back to readable formatting with its invariant notes: the defensive registry copy, atomic `addTrack`, the post-disposal no-op on `removeTrack`, two-way membership validation, why the publish order is the schedule, why retry state is separate from invalidation, and why `#isWarm` forces a first pass. `#removeTrack`'s `invalidateDependents` parameter from #139 is now explained. Behavior and error strings are untouched, deliberately, so the change reviews as a no-op. `StandaloneObservationAdapter.js` and `TrackObservationOwner.js` are formatted too.

**Gate added.** `packages/core/src/readability-boundary.test.js`, blocking under `npm test`. It is the mirror image of the GSAP quarantine: a PROTECTED list that may only grow, rather than an exception list that may only shrink. Protected files must stay under 140 columns, must not stack more than three statements on a line, and must still contain block comments. Five files are in it today.

Why not just turn on `format:check`: roughly a dozen source files are currently dense one-liners, including `GraphBinding.js`, `ObservationState.js` and `ProjectRuntime.js`, so a repo-wide prettier job would fail on contact. The formatting sweep is its own slice. Until then the protected list is the ratchet.

### F-12, boundary scan in CI

New blocking `boundary-scan` job runs `npm run boundary:v5:pass2`. It fails on a new unapproved GSAP import in core or a stale quarantine entry, and reports the known P2-03/P2-04 ownership gaps without failing. `boundary:v5:pass2:strict` is now a script, ready to become the completion gate when P2-03 lands.

### F-14, scan coverage

The Track check now matches the full ban list from [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md), including `#observed`, `#observers`, `#graphGuard`, `_setObservationComposer`, `_addObserver`, `_removeObserver`, `observerCount` and `observerIds`, and reports which symbols matched rather than a yes/no. The scan also walks `packages/react/src` now: its five direct GSAP imports are reported as a distinct `renderer-gsap-import` tier, non-blocking today and strict-blocking, because whether the DOM hooks layer counts as an approved renderer adapter is a P2-05/P2-06 decision rather than a P2-02 violation.

### F-16, quarantine count

Ten entries, nine tests and one fixture. Read the count from `scripts/v5-gsap-allowlist.mjs`, never restate it.

## Next

The pre-merge set is done. What remains before Track observation state can be deleted is the ownership design, in this order: **F-02** decide and inject adapter scope, **F-01** invert the bridge so `ObservationState` writes and Track reads, **F-03** move `observerCount`/`observerIds` onto the adapter and prove equivalence. F-06, F-07, F-08 and F-10 fall out of that work. None of them is a formatting change and none should be attempted without a local test run.
