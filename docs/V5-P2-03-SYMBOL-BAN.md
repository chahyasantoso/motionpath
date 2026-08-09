# P2-03 Track observation symbol-ban slice

This slice follows PR #139 and removes the remaining Track-owned observation seams without changing topology, publisher rollout, cross-motion, or free-track defaults.

**Updated 2026-08-08 21:10** per [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md). The original list was necessary but not sufficient: it named symbols to delete without naming their consumers or the prerequisite ownership decision.

## Prerequisites, do these first

1. **F-02, adapter scope.** Decide whether a standalone adapter is owned per Motion or per ProjectRuntime, and inject it. Today `createTrack` and the `Track` constructor each create one per Track, which reverses a recorded decision and makes the reported observer set depend on destroy-subscriber iteration order. Removing Track state on top of per-Track adapters bakes the divergence in.
2. **F-01, invert the bridge.** `ObservationStateBridge` currently derives state from `Track.observedEdges`, and `GraphBinding.#refreshObservationBridge()` rebuilds it after every commit. State must become the writer and Track the reader before the reader can be deleted.
3. **F-04, destroy ordering.** `Track.destroy` notifies destroy subscribers before setting `#destroyed`, so `GraphBinding.removeTrack` re-enters `destroy()`. Add a `#destroying` guard.
4. **F-05, unsubscriber bug.** `GraphBinding.#subscribeTrack` pushes `unsubscribe` where it means `unsubscribeDestroyed`.

## Target ownership

- `StandaloneObservationAdapter` owns standalone edges, source cleanup, mutual-observation composition, and observer indexes.
- `GraphBinding` and `ObservationState` own authored-graph edges, composition routing, and cycle rejection. One cycle validator, not three: `normalizeObservationGraph`, `ObservationState.#assertAcyclic`, and `GraphPublisher.#graphGuard` currently all implement it (F-07).
- `Track` remains a playhead and lifecycle object. It may expose temporary compatibility forwarding only while parity gates are active.

## Symbols to remove from Track

- `#observed`
- `#observers`
- `#graphGuard`
- `_setGraphGuard`
- `setObserved`
- `removeObserved`
- `replaceObserved`
- `observedSources`
- `observedEdges`
- `observerCount`
- `observerIds`
- observation cleanup helpers that mutate Track-owned edge state: `#removeObservedKey`, `#clearObserved`, `#detachObservationEdges`
- `_addObserver` and `_removeObserver`, the reverse-registry writers

Keep `_setObservationComposer` until `GraphBinding` stops routing composition through Track.

## Consumers to migrate before deletion

`Track.observedEdges` and the reverse registry are read outside Track. Each needs a replacement source, all of which exist on `ObservationState`:

| Consumer                                                     | Reads                                           | Replacement                                                               |
| ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `ObservationStateBridge.syncFromTracks()` / `assertParity()` | `track.observedEdges`                           | delete, once state is authoritative                                       |
| `GraphBinding.#assertTrackGraphMatches()`                    | `track.observedEdges`                           | `observationState.getEdges(id)`                                           |
| `GraphBinding.addEdge` / `removeEdge` / `replaceEdge`        | `observer.observedEdges` for rollback snapshots | `observationState.getEdges(observer.id)`                                  |
| `GraphPublisher.#graphGuard`                                 | `current.observedEdges`                         | delegate cycle checks to `ObservationState`                               |
| `Track.destroy` observer reporting                           | `this.#observers`                               | `adapter.state.getObserverIds(id)`, returned rather than spliced in place |

## Required evidence before removal

1. Standalone direct construction works with independently created source and observer Tracks.
2. A shared standalone adapter preserves mutual observation and diamond memoization. This is currently unprovable as written, because construction creates one adapter per Track. Fix F-02 first.
3. Source destruction removes dependent edges and reports observer IDs before cleanup, without depending on subscriber iteration order.
4. Child detachment removes observation edges and republishes surviving dependents.
5. Authored graph cycles are rejected before mutation, by one validator.
6. GraphBinding add, remove, and replace transactions restore live wiring, adapter state, and map functions after failure.
7. Repeated add, remove, replace, destroy, and detach operations are idempotent, and `destroy` is re-entrancy safe.
8. The strict boundary scan reports no Track observation ownership symbols. **The scan must be widened first:** it currently misses `#observed`, `#observers`, `observerCount`, `observerIds`, and `_setObservationComposer`, so this item can pass with the registry intact (F-14).
9. The scan runs in CI, and the format gate covers source files. Neither is true today (F-11, F-12).

## Guardrails

- Do not enable publisher rendering by default.
- Do not change cross-motion or free-track defaults.
- Do not merge until the complete Node 24 gate and focused parity/lifecycle/rollback suites are green, and remember that two of the seven jobs are `continue-on-error`.
- Do not delete a comment that records why an invariant exists. #139 did, in `GraphPublisher.js`, and those notes are being restored.
