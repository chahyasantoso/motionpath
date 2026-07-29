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
import { Engine, normalizeObservationGraph, topologicalTrackOrder, GraphPublisher } from "@motionpath/core";

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

### `Motion` and `Track`

`Motion.graphOrder` exposes the compiled parent-before-child IDs. `Motion.composeGraph()` returns a map of composed patches in that order. `Track.compose(rawData?)` remains renderer-neutral and `Track.subscribe(callback)` returns a disposer.

### Observation graph APIs

- `normalizeObservationGraph(motion)`: returns frozen JSON-safe `{ nodes, edges, order, errors }`.
- `topologicalTrackOrder(graph)`: returns a copy of the stable compiled order.
- `GraphPublisher`: collects dirty track IDs and publishes each dirty patch once per flush, while composing parents first for shared context.

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

Input edges wrap the source patch under `target`; output edges merge the source patch over the target patch. Cycles, missing sources, duplicate edges, invalid roles, and invalid targets are diagnosed by the graph IR. See `docs/RIG-GRAPH-GUIDE.md`, `docs/RIG-GRAPH-ARCHITECTURE.md`, and the React `/walker` demo.

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
6. Run `npm test`, `npm run build`, `npm run benchmark:rig` and `npm run pack:check`.
7. For folder moves, update imports, package exports, tests, and docs in one change; never leave a second shadow implementation.

## API sources

- Type declarations: `packages/core/src/types/` and package export maps
- Validators: `packages/core/src/validators/index.js`
- Runtime entry: `packages/core/src/engines/Engine.js`
- React hooks: `packages/react/src/hooks/`
- Reference FK demo: `apps/demo/src/components/Walker/`
