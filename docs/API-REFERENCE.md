# MotionPath API reference

This is the compact reference for humans and AI agents. The executable contract remains the validators and TypeScript declarations; this document explains which API to use and which layer owns it.

## Packages and ownership

| Package | Owns | Must not import |
| --- | --- | --- |
| `@motionpath/core` | schema, graph IR, validators, plugins, Engine, Motion, Track, composition, publishers, adapters | React, JSX, demo components |
| `@motionpath/react` | React hooks and subscriber bindings | demo scenes |
| `apps/demo` | routes, scenes, visual components, CSS, fixtures | private core internals |

## Core runtime

```js
import { Engine, normalizeObservationGraph, topologicalTrackOrder, GraphPublisher, GraphBinding } from "@motionpath/core";

const engine = new Engine();
await engine.loadProject(project);
const motion = engine.mountInstance("hero");
motion.play();
motion.pause();
motion.seek(0.5);
engine.unmount(motion);
engine.destroy();
```

### `Engine`

- `new Engine(options?)`: creates an isolated runtime dependency graph.
- `loadProject(project, options?)`: validates and parses a v4 project. Invalid projects throw before replacing the active project.
- `mountInstance(id)`: mounts a motion or standalone track by authored id.
- `mountWithDelegate(id, delegate)`: mounts a motion with a caller-owned trigger delegate.
- `createTrackInstance(id, overrides?)`: creates a track from a project track definition.
- `getTrack(id)`: finds a mounted track instance.
- `unmount(object)`: destroys only objects owned by this Engine.
- `destroy()`: idempotently releases mounted instances, subscriptions, observations, and timelines.

The real mount path builds a `GraphBinding` and a `GraphPublisher` per motion, so runtime graph mutations and publishing stay consistent without caller bookkeeping.

### `Motion` and `Track`

`Motion.graphOrder` exposes the compiled parent-before-child IDs. `Motion.composeGraph()` returns a map of composed patches in that order, keyed by track id.

`Track.compose(rawData?, ctx?)` is renderer-neutral. `ctx` is a per-call memo keyed by track id: it prevents recomputing a shared ancestor twice within one call, and it is discarded when the call returns. Track deliberately has no cross-frame cache, because two separate root calls must recompute for scrubbing and seeking to stay correct. Cross-flush caching belongs to `GraphPublisher`.

`Track.subscribe(callback)` returns a disposer. `Track.onLifecycle(callback)` reports `invalidated`, `edge-added`, `edge-replaced`, `edge-removed`, and `destroyed`, which is how the publisher learns a track needs recomposing.

Observation state:

- `setObserved(source, mapFn?, { role, target })`: adds or replaces one edge.
- `removeObserved(source, { role, target })`: removes matching edges.
- `replaceObserved(oldSource, newSource, mapFn?, options?)`: atomic pop-and-rewire. It validates before mutating, so a rejected rewire never leaves the observer dangling.
- `observedEdges`: full-fidelity edge records. `observedSources` remains the compatibility view and collapses roles.

A destroyed Track throws from `compose()` and `getSnapshot()`, and destroying a source removes the reverse observer edges it held.

### Observation graph APIs

- `normalizeObservationGraph(motion)`: returns frozen JSON-safe `{ valid, nodes, edges, order, errors }`.
- `topologicalTrackOrder(graph, { strict = true })`: returns a copy of the stable compiled order. Strict by default, and it throws on an invalid graph rather than handing back a partial order. Pass `strict: false` only for advisory tooling.
- `GraphBinding`: the only managed mutation boundary. `addEdge`, `removeEdge`, `replaceEdge`, `addTrack`, and `removeTrack` validate a candidate graph, move live Track wiring and publisher metadata together, and leave the previous graph intact when a mutation is rejected. Standalone `setObserved()` stays available for unbound Tracks.
- `GraphPublisher`: owns scheduling. `markDirty(id)` is O(1) and strict about unknown ids; `markAllDirty()` marks everything; `flush()` makes one forward pass over topological order.

`flush()` publishes the marked nodes **and their full downstream closure**, because a dependent's composed output changes when its source does. Idle nodes keep their cached patch instead of recomposing. A compose failure blocks that node's downstream closure and stays pending for the next flush; a publish failure retries only the failed node, since its patch is valid and its dependents already rendered correct data. Independent branches keep going, and errors surface as one `AggregateError` after the pass.

Publish retries are configurable per publisher:

```js
const publisher = new GraphPublisher({
  graph,
  tracks,
  publish,
  retry: { maxAttempts: 3, backoff: 2, onExhausted: "retain" },
});
```

`maxAttempts` counts failed publish calls per node, `backoff` skips complete flushes between attempts, and the backward-compatible defaults are `Infinity` attempts and zero backoff. Exhaustion retains the valid cached patch and stops retrying; `resetRetry(id)` re-arms a node after renderer recovery. Compose failures never consume this budget. `onExhausted: "drop"` is available when bounded work matters more than eventual repaint. See `docs/V4.3-GRAPH-CORRECTNESS-PLAN.md` for the full failure contract.

## Schema

Every project uses `schemaVersion: 4`. A motion has `id`, `trigger`, and `tracks`. Use `id`, never `motionId`; use `trigger` directly, never a v2/v3 `driver` wrapper.

```js
const project = {
  schemaVersion: 4,
  motions: [{
    id: "hero",
    trigger: { type: "time", autoplay: false },
    tracks: [{
      id: "hero-opacity",
      duration: 1,
      keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } }
    }]
  }]
};
```

## Observations and FK

Use JSON-safe edges for authored dependencies:

```js
observes: [{ source: "shoulder", role: "input", target: "parentWorld" }]
```

Input edges wrap the source patch under `target`; output edges merge the source patch over the target patch. Cycles, missing sources, duplicate edges, invalid roles, and invalid targets are diagnosed by the graph IR. One source may provide both an input and an output edge to the same observer: role and target are part of edge identity. See `docs/RIG-GRAPH-GUIDE.md`, `docs/RIG-GRAPH-ARCHITECTURE.md`, and the React `/walker` demo.

## React integration

```jsx
import useMotionProject from "@motionpath/react/useMotionProject";
import useScrollMotion from "@motionpath/react/useScrollMotion";
import useMotionSubscriber from "@motionpath/react/useMotionSubscriber";
```

`useMotionProject(project)` loads and cleans up the shared Engine. `useScrollMotion(schema, sharedRefs?)` returns `{ refs, instance }`; pass `refs.trigger` and `refs.pin` to real DOM elements. `useMotionSubscriber(instance, trackId, ref, transform?)` streams composed patches to the DOM without React state updates in the frame loop.

## AI implementation rules

1. Read the schema validator before inventing fields.
2. Preserve v4 names: `id`, `trigger`, `tracks`, `observes`.
3. Keep React, JSX, DOM, and demo imports outside core.
4. Prefer Engine/Motion/Track public methods over private delegates.
5. Add a focused regression test before changing runtime behavior.
6. Never give a graph test a fake object-literal track. Use the real `Track` fixtures in `packages/core/src/__fixtures__/graphTracks.js`; fake tracks are what hid the v4.2 publishing bug.
7. Route runtime graph mutations through `GraphBinding`, not through ad-hoc `setObserved` plus publisher edits.
8. Run `npm test`, `npm run build`, `npm run benchmark:rig` and `npm run pack:check`.
9. For folder moves, update imports, package exports, tests, and docs in one change; never leave a second shadow implementation.

## API sources

- Type declarations: `packages/core/src/types/` and package export maps
- Validators: `packages/core/src/validators/index.js`
- Runtime entry: `packages/core/src/engines/Engine.js`
- Graph layer: `packages/core/src/usecases/` (`normalizeObservationGraph.js`, `GraphBinding.js`, `GraphPublisher.js`)
- React hooks: `packages/react/src/hooks/`
- Reference FK demo: `apps/demo/src/components/Walker/`
