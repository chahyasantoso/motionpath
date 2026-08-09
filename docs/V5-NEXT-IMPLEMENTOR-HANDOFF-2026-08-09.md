# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 09:52 Asia/Jakarta  
**Base:** `v5` at `e4fc9b9`  
**Active PR:** [#142](https://github.com/chahyasantoso/motionpath/pull/142), draft, head `3a60b15`  
**Superseded PR:** [#141](https://github.com/chahyasantoso/motionpath/pull/141), closed

## Current truth

Do not merge #142. Its latest known CI run has the non-unit checks green and the unit-test gate failed. The previous attached unit log at merge ref `0b9bc30` reported **78 failed tests** because `createTrack` used nullish fallback for an explicitly passed `observationAdapter: null`. That made authored-graph Tracks accidentally receive standalone adapters, so GraphBinding saw zero live edges against declared edges. This was a single root-cause cascade, not 78 independent regressions.

The fix is on #142 in `createTrack.js`: distinguish an omitted option from an explicit `null` and preserve `null`. This must be verified first. The latest PR head shown by GitHub is `3a60b15`; check CI against the current head before trusting any older attached log.

## Failure history and current blockers

1. The original F-02 implementation keyed shared observation state by public Track IDs. Valid duplicate local IDs (`left/bone`, `right/bone`) collided.
2. A follow-up introduced private identity keys, but initially leaked internal keys through public queries and compose contexts. That caused the 18-failure run.
3. Public adapter queries and CI trigger deduplication were repaired in #142. Feature/fix/test branches should now run PR validation only, while protected branches retain push validation. Expected visible workflow set: 8 jobs, not 16.
4. The 9-failure run reduced to adapter/lifecycle, GraphBinding teardown, and readability failures.
5. The 5-failure run isolated observer IDs during destroy and readability. Subsequent patches attempted shared-owner cleanup and bridge filtering.
6. The 78-failure run occurred after the GraphBinding patch but before the explicit-null fix. Treat its GraphBinding errors as cascade symptoms, not as proof that every GraphBinding test is independently broken.

## Required next sequence

### 1. Verify the explicit-null fix in isolation

In `packages/core/src/lib/createTrack.js`, the rule must be:

- `observationAdapter` omitted, standalone mode: create the compatibility adapter.
- `observationAdapter: null`, authored graph: keep `null`.
- `observationAdapter: sharedAdapter`, standalone mode: use that exact adapter.

Run the focused authored graph and Engine graph ownership tests first, then the full unit suite. Do not change GraphBinding parity semantics until this passes.

### 2. Fix destroy observer reporting without global state

Current `StandaloneObservationAdapter.js` uses module-global `sharedOwner`, `globalTracks`, `globalKeys`, and `globalRefs`. This is a code smell and likely causes cross-test leakage and nondeterministic teardown. Replace it with an explicit shared ownership object scoped to `ProjectRuntime` or a caller-provided adapter. Direct Track compatibility should use one adapter per explicitly shared group, not module-global state.

The destroy callback must snapshot observer Track objects/IDs **before** removing source edges. `Track.destroy()` currently reads `this.observerIds`, then invokes destroy subscribers. Preserve that order and make the adapter callback report from a stable snapshot, not a query after cleanup.

### 3. Fix GraphBinding ownership in the intended direction

`ObservationStateBridge` still calls `syncFromTracks()` and `GraphBinding.#refreshObservationBridge()` destroys/rebuilds the bridge after commits. This remains F-01: Track is still the authority. Do not paper over this with more stale-edge filtering. The correct next slice is to make ObservationState receive writes first, then have GraphBinding/Publisher read it. Migrate these consumers before deleting Track state:

- `GraphBinding.#assertTrackGraphMatches`
- GraphBinding rollback snapshots in add/remove/replace
- GraphPublisher cycle guard
- ObservationStateBridge parity logic

### 4. Restore readability properly

The readability gates are not optional. `Track.js` and `StandaloneObservationAdapter.js` must be formatted to the configured line and statement limits, with explanatory block comments retained. Do not raise limits, remove guarded files, or weaken tests. `GraphPublisher.js` is readable on the branch; preserve its reasoning comments.

## Verification checklist

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

Require the full unit gate green before marking any finding closed. The benchmark jobs are informational because CI still sets `continue-on-error: true` for them.

## Files to inspect first

- `packages/core/src/lib/createTrack.js`
- `packages/core/src/usecases/StandaloneObservationAdapter.js`
- `packages/core/src/usecases/TrackObservationOwner.js`
- `packages/core/src/usecases/ObservationState.js`
- `packages/core/src/usecases/ObservationStateBridge.js`
- `packages/core/src/usecases/GraphBinding.js`
- `packages/core/src/usecases/GraphPublisher.js`
- `packages/core/src/lib/Track.js`
- `.github/workflows/ci.yml`

## Hard guardrails

- Do not merge #142 while unit tests fail.
- Do not reintroduce per-Track standalone registries for related Tracks.
- Do not use module-global graph ownership to make tests pass.
- Do not classify a green non-unit workflow set as a green implementation.
- Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
