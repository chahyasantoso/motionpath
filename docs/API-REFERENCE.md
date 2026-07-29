# MotionPath API reference

This is the compact reference for humans and AI agents. The executable contract remains the validators and TypeScript declarations; this document explains which API to use and which layer owns it.

## Packages and ownership

| Package | Owns | Must not import |
| --- | --- | --- |
| `@motionpath/core` | schema, validators, plugins, Engine, Motion, Track, composition, adapters | React, JSX, demo components |
| `@motionpath/react` | React hooks and subscriber bindings | demo scenes |
| `apps/demo` | routes, scenes, visual components, CSS, fixtures | private core internals |

During the v4.1 extraction, the source tree is still being migrated from `src/*`; use the package map in `docs/ARCHITECTURE.md` when adding files.

## Core runtime

```js
import { Engine } from "@motionpath/core";

const engine = new Engine();
await engine.loadProject(project);
const motion = engine.mountInstance("hero");
motion.play();
motion.pause();
motion.seek(0.5);
motion.reverse();
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

### `Motion`

Public controls are deliberately trigger-neutral: `play()`, `pause()`, `seek(progress)`, `reverse()`, and `onComplete(callback)`. Do not reach through a concrete trigger delegate.

### `Track`

- `progress()` reads progress; `progress(value)` seeks a track.
- `compose(rawData?)` returns a renderer-neutral patch.
- `subscribe(callback)` returns a disposer.
- `setObserved(source, mapFn, { role })` wires an imperative dependency.
- `destroy()` is safe to call repeatedly.

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

Trigger rules: scroll triggers require `scrub`; scroll-scrub motions cannot define track durations, repeats, yoyo, or delay. Time triggers own duration through track definitions and support repeat/yoyo/repeatDelay/delay/autoplay. Manual triggers are controlled by the caller.

## Plugins

A plugin declares authored keys, runtime inputs, composition, output merge behavior, and optionally a lazy loader.

```js
const plugin = createAnimationPlugin({
  keys: ["boneLength"],
  inputs: ["parentWorld"],
  claimsKey: (key) => key === "boneLength",
  contribute(key, stops) { return { percentPatch: {}, tweenVars: {} }; },
  compose(raw) { return { x: raw.boneLength ?? 0 }; }
});
```

`keys` are authored keyframe fields. `inputs` are runtime values. `claimsKey` must not claim inputs. Registry registration validates keys, inputs, internal keys, stages, priorities, lifecycle functions, and collisions before mutation.

## Observations and FK

Use JSON-safe edges for authored dependencies:

```js
observes: [{ source: "shoulder", role: "input", target: "parentWorld" }]
```

Input edges wrap the source patch under `target`; output edges merge the source patch over the target patch. Cycles, missing sources, duplicate edges, invalid roles, and invalid targets fail validation before mounting. See `docs/FORWARD-KINEMATICS.md` and the React `/walker` demo for the complete FK example.

## React integration

```jsx
import useMotionProject from "@motionpath/react/useMotionProject";
import useScrollMotion from "@motionpath/react/useScrollMotion";
import useMotionSubscriber from "@motionpath/react/useMotionSubscriber";
```

`useMotionProject(project)` loads and cleans up the shared Engine. `useScrollMotion(schema, sharedRefs?)` returns `{ refs, instance }`; pass `refs.trigger` and `refs.pin` to real DOM elements. `useMotionSubscriber(instance, trackId, ref, transform?)` streams composed patches to the DOM without React state updates in the frame loop.

## Renderer contract

A renderer consumes complete patches. Plugin-owned `internalKeys` and framework keys are filtered before rendering. DOM rendering is an adapter concern; do not import it into core domain logic. Subscriber cleanup must dispose the subscription and clear renderer cache.

## AI implementation rules

1. Read the schema validator before inventing fields.
2. Preserve v4 names: `id`, `trigger`, `tracks`, `observes`.
3. Keep React, JSX, DOM, and demo imports outside core.
4. Prefer Engine/Motion/Track public methods over private delegates.
5. Add a focused regression test before changing runtime behavior.
6. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run pack:check`.
7. For folder moves, update imports, package exports, tests, and docs in one change; never leave a second shadow implementation.

## API sources

- Type declarations: `src/types/motionpath.d.ts`
- Validators: `src/validators/index.js`
- Runtime entry: `src/engines/Engine.js`
- React hooks: `src/hooks/`
- Reference FK demo: `src/components/Walker/`
