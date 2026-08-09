# Pass-2 review resolution log

**Tracks:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Branch:** `v5`, after #140 merged  
**Updated:** 2026-08-09 08:23 Asia/Jakarta

One row per finding. A finding is **closed** only when the fix is on the branch and the gate that would catch a regression exists. "Deferred" means it has an owner and a work package, not that it was dismissed.

| ID | Severity | Status | Where |
|---|---|---|---|
| F-01 ObservationState derived from Track | High | Open, blocks the symbol-ban | P2-03 removal design |
| F-02 per-Track standalone adapters | High | **Design landed, implementation slice landed** | `ProjectRuntime.standaloneObservationAdapter`, Engine injection, lifecycle test |
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

Closed: 6. F-02 is now implemented at the runtime boundary, but its legacy direct-Track fallback remains until the P2-03 removal slice. Open: 15, all with a package.

## F-02 decision

**Scope: one standalone observation adapter per ProjectRuntime.** This is the right boundary for the current architecture: every standalone Track created by one Engine shares one registry, while the adapter lifecycle ends with project/runtime disposal. Authored-graph Tracks explicitly pass `observationAdapter: null` and remain owned by GraphBinding.

Direct `new Track()` construction remains a compatibility path. Without an owning ProjectRuntime, callers must inject one shared `StandaloneObservationAdapter` when they create related Tracks. The per-Track fallback is intentionally retained for isolated direct Tracks and is not evidence of cross-Track support. The next P2-03 slice removes the fallback once all direct callers have migrated.

## What landed for F-02

- `ProjectRuntime` constructs and owns one `StandaloneObservationAdapter`, exposes it read-only, and destroys it during runtime disposal.
- `Engine.#trackOptions()` injects that adapter into all standalone `createTrack` paths.
- Authored graph construction overrides it with `null`, so GraphBinding remains the only graph owner there.
- A lifecycle test proves identity stability and disposal.

## Next

Now do F-01: invert the bridge so `ObservationState` is authoritative, migrate GraphBinding rollback/parity and GraphPublisher cycle consumers off `Track.observedEdges`, then move F-03 observer queries onto the adapter before deleting Track's duplicate state.
