# Graph-backed Spiral demo plan

## Goal

Add a second Spiral demo that behaves like the existing `/spiral` Zuma scene while making the runtime dependency graph visible and real. The existing demo remains the behavioral reference and is not rewritten in this work.

## Behavioral parity

The new route must preserve the original scene's contract:

- 30-ball waves, automatic spawning, and the same spiral path geometry;
- staggered host placement and sibling reflow after a pop;
- entrance scale/opacity animation;
- exit scale/opacity animation on click or arrival at the hole;
- removal after exit and wave reset when the host is empty;
- no per-frame React state loop and no second animation clock.

## Graph model

Each spawned ball is a graph root with explicit renderer-neutral dependencies:

```text
ball-path -> ball-entrance
ball-path -> ball-exit
```

The path track owns `pathProgress`, position, base opacity, and size. Entrance and exit tracks own only transition values. Their edges use `role: "output"`, and the final published patch is composed by `GraphPublisher` in topological order. Overlay lifecycle becomes a graph mutation through `GraphBinding`, not an untracked `setObserved` call.

## Implementation slices

1. **Model and contract:** add graph-specific motion definitions and tests proving IDs, roles, acyclic order, and transition ownership. This PR starts here.
2. **Runtime adapter:** add a small `useGraphSpiralController` that creates one `GraphBinding`/`GraphPublisher` per spawned ball, reuses the existing `Spawner`, and keeps the current `Overlay` timing semantics.
3. **View and route:** reuse Spiral geometry/CSS, add `GraphSpiralPage`, `/spiral-graph`, and navigation labels that distinguish the reference from the graph demo.
4. **Parity tests:** compare spawn/remove/reflow transitions against the existing controller contract, plus graph invalidation tests for base progress and overlay replacement.
5. **CI/demo verification:** run unit tests, build, package check, benchmark, and manually verify both routes. The original `/spiral` must remain unchanged.

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
