# Graph-backed Spiral demo plan

## Goal

Add a second Spiral demo that behaves like the existing `/spiral` Zuma scene while making the runtime dependency graph visible and real. The existing `/spiral` demo remains the behavioral reference and is not rewritten.

## Current state

PR [#74](https://github.com/chahyasantoso/motionpath/pull/74) is open as a work in progress. The model, route, controller, per-ball graph identities, navigation entry, and contract test are implemented. All CI entries are green on the latest commit.

The current slice is not yet a full parity sign-off: browser verification and focused spawn/remove/reflow parity tests are still pending.

## Behavioral parity

The new route must preserve the original scene's contract:

- 30-ball waves, automatic spawning, and the same spiral path geometry;
- staggered host placement and sibling reflow after a pop;
- entrance scale/opacity animation;
- exit scale/opacity animation on click or arrival at the hole;
- removal after exit and wave reset when the host is empty;
- no per-frame React state loop and no second animation clock.

## Graph model

Each spawned ball has unique graph IDs and explicit renderer-neutral dependencies:

```text
ball-N-path -> ball-N-entrance
ball-N-path -> ball-N-exit
```

The path track owns authored `path` progress, position, base opacity, and size. `pathProgress` is the path plugin's synthetic runtime field, not an authored schema key. Entrance and exit tracks own transition values. Their edges use `role: "output"`, and GraphPublisher composes the graph in topological order. Runtime graph ownership is established through GraphBinding.

## Implemented slices

1. **Model and contract:** complete. Graph-specific motion definitions, stable normalized order, explicit edge identity, and transition ownership tests are in place.
2. **Runtime adapter:** implemented in `useGraphSpiralController`. It creates real Engine tracks, wires a GraphBinding and GraphPublisher per ball, reuses Spawner and the existing group-host reflow, and cleans up tracks on removal.
3. **View and route:** implemented as `GraphSpiralPage`, `GraphSpiralBall`, `/spiral-graph`, and a distinct navigation label. Existing `/spiral` is untouched.

## Next slices

4. **Parity tests:** add focused tests for spawn, click-to-pop, auto-removal, wave reset, overlay replacement, and publisher invalidation after path progress changes.
5. **Browser verification:** manually compare `/spiral` and `/spiral-graph` for spacing, reflow, transition timing, cleanup, and wave restart. Fix only Graph Spiral issues; do not rewrite the reference route.
6. **CI/demo verification:** keep the five standard checks green and document the manual verification result before merging #74.

## Non-goals

- Do not change the declarative schema.
- Do not replace the existing Spiral controller in place.
- Do not add a second clock or a per-frame React polling loop.
- Do not put DOM or React concerns into `@motionpath/core`.
- Do not add renderer-specific retry policy to the demo.

## Acceptance criteria

- `/spiral` has no behavioral or source diff outside shared helpers.
- `/spiral-graph` matches the original interaction and wave behavior.
- GraphBinding owns every runtime edge mutation.
- A base progress change republishes the base and downstream transition nodes only.
- Replacing an overlay is atomic and leaves no reverse observer dangling.
- Removing a ball destroys its tracks and clears publisher state.
- Browser parity is checked before merging.
