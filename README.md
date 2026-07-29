# MotionPath v4

MotionPath is a data-first animation runtime built on GSAP. Projects are plain JSON, tracks animate plain proxy objects, and subscribers render composed patches directly to DOM without React state updates in the frame loop.

## Documentation

- [MotionPath v4 System Guide](docs/MOTIONPATH-V4-SYSTEM-GUIDE.md): human and AI onboarding, schema rules, lifecycle, architecture diagrams, plugin contracts, composition, rendering, orchestration, and debugging.
- [Forward kinematics and observations](docs/FORWARD-KINEMATICS.md): the formal `plugin.keys` / `plugin.inputs` / `track.observes` contract.
- [Public v4 TypeScript declarations](src/types/motionpath.d.ts): the typed schema and runtime API contract.
- [Executable validators](src/validators/): the runtime schema truth source.

## Quick start

```js
import { Engine } from "./src/engines/Engine.js";

const engine = new Engine();
await engine.loadProject({
  schemaVersion: 4,
  motions: [
    {
      id: "hero",
      trigger: { type: "time", autoplay: false },
      tracks: [
        {
          id: "hero-track",
          duration: 1,
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
  ],
});
const motion = engine.mountInstance("hero");
motion.play();
// On teardown: engine.unmount(motion), or engine.destroy().
```

## v4 invariants

- Use `id`, never `motionId`, in authored schema.
- `stagger` is measured in seconds.
- Keep the domain and use cases DOM-free.
- Use `Motion.play/pause/seek/reverse`, not concrete trigger delegates.
- Use `Spawner` and `Overlay` for orchestration instead of component-owned RAF loops.
- Run `npm test` and `npm run typecheck` before merging.

## Tests

```bash
npm test
npm run typecheck
```

CI runs both commands on Node 20 and 22 for pushes and pull requests targeting `v4` or `main`.
