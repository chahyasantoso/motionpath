# MotionPath API reference

This is the compact reference for humans and AI agents. The executable contract remains the validators, TypeScript declarations, and package export map.

## Packages and ownership

| Package | Owns | Must not import |
| --- | --- | --- |
| `@motionpath/core` | schema, graph IR, validators, plugins, Engine, Motion, Track, composition, publishers, adapters | React, JSX, demo components |
| `@motionpath/react` | React hooks and subscriber bindings | demo scenes |
| `apps/demo` | routes, scenes, visual components, CSS, fixtures | private core internals |

## Public core entrypoint

Import supported APIs from `@motionpath/core`. The package root intentionally does **not** export graph/runtime implementation classes such as `GraphRuntime`, `MotionRuntime`, `PatchRegistry`, `GraphBinding`, `GraphPublisher`, `ProjectRuntime`, or graph normalization helpers. Those are migration internals and are available only through the unadvertised `@motionpath/core/internal` entrypoint for repository code and tests.

The package export map is allow-listed. Deep wildcard imports such as `@motionpath/core/lib/*`, `@motionpath/core/usecases/*`, and `@motionpath/core/runtime/*` are blocked rather than treated as public API.

```js
import { Engine, mergePatches, pathPlugin } from "@motionpath/core";
import { domRenderer } from "@motionpath/core/adapters/domRenderer.js";
```

## Core runtime

```js
import { Engine } from "@motionpath/core/engines/Engine";

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

`Engine.publisherRendering` is an opt-in migration gate. It accepts only the literal boolean `true`; it is disabled by default. When enabled before mounting, motions publish immutable patches through the runtime path. Existing mounts are not hot-swapped.

## Graph and runtime internals

The graph IR, binding, publisher, patch registry, and ProjectRuntime remain tested implementation machinery. Do not import them from application code. Repository tests that need them use `@motionpath/core/internal` or relative source imports.

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

## API sources

- Type declarations: `packages/core/src/types/` and the package export map
- Validators: `packages/core/src/validators/index.js`
- Runtime entry: `packages/core/src/engines/Engine.js`
- React hooks: `packages/react/src/hooks/`
