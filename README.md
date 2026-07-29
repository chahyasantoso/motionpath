# MotionPath v4

MotionPath is a data-first animation runtime built on GSAP. Projects are plain JSON, tracks animate plain proxy objects, and subscribers render composed patches directly to the DOM without React state updates in the frame loop.

## Documentation

- [API reference](docs/API-REFERENCE.md): human and AI reference for Engine, schema, plugins, observations, React hooks, and package boundaries.
- [System guide](docs/MOTIONPATH-V4-SYSTEM-GUIDE.md): lifecycle, architecture, validation, composition, rendering, orchestration, and debugging.
- [Architecture map](docs/ARCHITECTURE.md): package layout and extraction status.
- [Forward kinematics](docs/FORWARD-KINEMATICS.md): plugin inputs, observations, and the FK walker.
- [Public declarations](src/types/motionpath.d.ts): typed schema and runtime API contract.

## Quick start

```js
import { Engine } from "@motionpath/core";

const engine = new Engine();
await engine.loadProject({
  schemaVersion: 4,
  motions: [{
    id: "hero",
    trigger: { type: "manual" },
    tracks: [{ id: "hero-track", keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }],
  }],
});
const motion = engine.mountInstance("hero");
motion.seek(1);
```

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run pack:check` before merging.
