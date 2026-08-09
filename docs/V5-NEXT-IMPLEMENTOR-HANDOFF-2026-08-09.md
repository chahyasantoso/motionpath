# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:11 Asia/Jakarta  
**Base:** `fix/pass2-f02-regressions-v2` after the failure-log repair and F-02 ownership follow-up  
**Active PR:** [#142](https://github.com/chahyasantoso/motionpath/pull/142), draft

## Current truth

The attached three-failure run is resolved. The branch now contains the rollback/mapFn repair, the fuzz hot-path fix, restored Track readability reasoning, and the replacement of module-global standalone ownership with scoped adapters. CI has reported all eight workflow jobs green on the current head. Do not merge until the normal review process is complete, but the unit gate is no longer failing.

## Completed in this handoff

- `createTrack` distinguishes omitted `observationAdapter` from explicit `null`, preserving authored-graph ownership semantics.
- GraphBinding rollback restores ObservationState and Track wiring symmetrically, including each edge's `mapFn`.
- ObservationState and the adapter avoid full-registry cloning on compose, parity, and fuzz paths.
- Track readability comments and destroy re-entrancy protection are restored.
- Standalone ownership is scoped to `ProjectRuntime` or an explicitly injected adapter; module-global ownership is gone.
- Destroy observer IDs are snapshotted before adapter cleanup.

## Next work, now in line

1. **F-01 ownership inversion:** stop deriving ObservationState from `Track.observedEdges`. Construct the bridge from the normalized graph/state writes, and make parity checks compare Track only as a compatibility assertion.
2. Migrate `GraphBinding.#assertTrackGraphMatches` and `GraphPublisher` cycle validation to ObservationState reads.
3. Add focused tests for duplicate public Track IDs inside separate scoped adapters and for cross-adapter destroy observer snapshots.
4. After those pass, remove Track's duplicate observation maps and delete the compatibility symbols under a separate boundary-gated change.

## Verification checklist

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

Benchmarks remain informational. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
