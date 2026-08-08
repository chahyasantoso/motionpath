# P2-03 Track observation symbol-ban slice

This slice follows PR #139 and removes the remaining Track-owned observation seams without changing topology, publisher rollout, cross-motion, or free-track defaults.

## Target ownership

- `StandaloneObservationAdapter` owns standalone edges, source cleanup, mutual-observation composition, and observer indexes.
- `GraphBinding` and `ObservationState` own authored-graph edges, composition routing, and cycle rejection.
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
- observation cleanup helpers that mutate Track-owned edge state

## Required evidence before removal

1. Standalone direct construction works with independently created source and observer Tracks.
2. A shared standalone adapter preserves mutual observation and diamond memoization.
3. Source destruction removes dependent edges and reports observer IDs before cleanup.
4. Child detachment removes observation edges and republishes surviving dependents.
5. Authored graph cycles are rejected before mutation.
6. GraphBinding add, remove, and replace transactions restore live wiring, adapter state, and map functions after failure.
7. Repeated add, remove, replace, destroy, and detach operations are idempotent.
8. The strict boundary scan reports no Track observation ownership symbols.

## Guardrails

- Do not enable publisher rendering by default.
- Do not change cross-motion or free-track defaults.
- Do not merge until the complete Node 24 gate and focused parity/lifecycle/rollback suites are green.
