# MotionPath v4

MotionPath is a data-first animation runtime built on GSAP. Projects are plain JSON, tracks animate plain proxy objects, and subscribers render composed patches directly to DOM without React state updates in the frame loop.

## Quick start

```js
import { Engine } from './src/engines/Engine.js';

const engine = new Engine();
await engine.loadProject({
  schemaVersion: 4,
  motions: [{
    id: 'hero',
    trigger: { type: 'time', autoplay: false },
    tracks: [{
      id: 'hero-track',
      duration: 1,
      keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } },
    }],
  }],
});
const motion = engine.mountInstance('hero');
motion.play();
// On teardown: engine.unmount(motion), or engine.destroy().
```

## v4 schema rules

Every motion uses `id`, `trigger`, and a non-empty `tracks` array. Use `schemaVersion: 4`; `motionId`, `driver`, `timelineId`, `primary`, `lifecycle`, and `playback` are not v4 fields. A scroll-scrub motion must provide `scrub` and cannot use track durations. `stagger` is measured in seconds.

Tracks may use reusable templates, CSS custom properties, colors, filters, image sequences, paths, and forward-kinematic `boneLength`. Path anchoring defaults to `center`; use `anchor: 'none'` or `{ xPercent, yPercent }` to override it.

## Runtime layers

`Engine` loads and validates a project, mounts independent `Motion` or `Track` instances, owns stamped tracks through `createTrackInstance()` / `adopt()`, and prunes objects through `unmount()`. `Motion` exposes `play`, `pause`, `seek`, `reverse`, and `onComplete`. `Track.compose()` is renderer-agnostic.

Plugins are registered with `registerPlugin(plugin)` and removed with `unregisterPlugin(plugin)`. Plugins may declare `stage`, `priority`, `outputs`, `internalKeys`, and an async `prepare(track)` hook. `parseV4Project()` awaits preparation before returning.

## React integration

Use `useMotionProject` to load a project, `useMotionInstance` to mount a motion, `useScrollMotion` for component-local ScrollTrigger refs, and `useMotionSubscribers` for direct DOM rendering. Subscriber patches are coalesced to one DOM write per GSAP tick. Never call React state setters from a per-frame subscriber.

## Tests

```bash
npm test
```

Validation is runtime-enforced by `Engine.loadProject()`. Invalid projects throw `MotionPathValidationError` with all fatal paths and rule ids. For orchestration, use the injected-clock `Spawner` and race-safe `Overlay` primitives instead of adding component-owned RAF loops.
