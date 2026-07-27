# Walkthrough — Per-Call Compose Scoping & v4 Demo/Zuma Alignment

Implemented the per-call compose scoping design brief and fixed all v3 compatibility issues in the Demo and Spiral pages to fully align with the v4 track-first system.

---

## 1. Per-Call Compose Scoping (`src/lib/Track.js`)

Removed the instance-level `#composing` boolean re-entrancy guard to prevent exponential execution overhead on deep dependency graphs and complex forward kinematics:

- **Per-Call Context (`ctx`)**: Added a temporary, garbage-collected `Map` (`ctx`) passed through `compose(rawData, ctx)` during recursion.
- **Sentinels**: Added a module-level `COMPOSING` Symbol sentinel. When a track is first visited, it is marked as `COMPOSING` in the context Map. If a back-edge is encountered, it returns the local (plugin-only) patch without further recursion.
- **Single-Call Memoization (Diamond Cache)**: Resolved patches are stored in `ctx`. If a node is reached multiple times via different paths within a single root compose call (e.g. A -> B -> D and A -> C -> D), the cached patch is returned instantly instead of recomputing, avoiding exponential work.
- **Checklist & Safety**:
  - Removed `#composing` instance field entirely.
  - Eliminated `try/finally` block from `compose()` since `ctx` is local to the stack and automatically discarded if an error occurs.
  - Recursion correctly threads `ctx` down via `observedSource.compose(undefined, ctx)`.
  - Added unit test `memoizes a diamond-shared source within a single compose() call` in `Track.test.js` to assert memoization logic.

---

## 2. Unmounting Layout Children (`src/lib/Track.js`)

Added `this.#host._unmountChild(child)` call inside `removeChild(id)`.

### Why is this here?

When a track adds a child dynamically using `Track.addChild(child, { stagger })`, the parent track delegates the placement to a `LayoutDelegate` and informs the host (the `Motion` instance) via `this.#host._mountChild(child, spawnOffset)`. The host creates a GSAP tween (`gsap.to(track, { progress: 1 })`) and registers it in its master timeline.

If we don't call `this.#host._unmountChild(child)` during `removeChild(id)`:

1. The child track's GSAP tween continues to exist and animate on the master timeline.
2. The track's subscriptions remain alive, causing memory leaks and rendering updates for elements that have already been visually removed.
3. Subsequent reflows and layouts can become desynchronized with active GSAP timelines.

Adding this check ensures that when a track is discarded, its associated GSAP tweens are killed and cleanly removed from the master timeline.

---

## 3. Demo Page & Spiral Zuma Refactoring (v4 Alignment)

### Demo Page (`src/components/Demo/DemoPage.jsx`)

- **Shared Track Composition**: Refactored `CarouselDemo` and `HelixDemo` to use `Track.addChild` and `Track.removeChild` instead of the deprecated v3-era `instance.addChild` / `instance.removeChild` / `instance.children` on `Motion` instances.
- **Concurrent Exit Tracks**: Replaced the single-instance `card-exit` motion with dynamic, transient tracks constructed using `createTrack` and animated concurrently using `gsap.to(exitTrack, { progress: 1 })` to eliminate animation conflicts when multiple cards are removed in rapid succession.
- **Imports & Cleanups**: Replaced `productionEngine` imports/calls with the new `engine` exports, and added `gsap` imports.

### Spiral Zuma Page (`src/components/Spiral`)

- **useSpiralWaveController.js**:
  - Fully refactored to align with the v4 track-first system.
  - Spawns balls by constructing dynamic tracks via `createTrack()` and adding them to the parent `keepalive` track via `parentTrack.addChild()`.
  - Controls entry, exit, and main travel progress using native `gsap.to(track, { progress: 1 })` tweens.
  - Subscribes to the track progress and triggers the exit sequence when `progress >= 1`.
  - Replaced legacy `ProductionEngine` import with the v4 `engine` import.
- **SpiralBall.jsx**: Updated to subscribe directly to `Track` objects (`track` property on sources) rather than passing deprecated `instance` and `trackId` properties.
- **createBallVm.js**: Updated fields to store and reference `baseTrack` and `activeTrack`.

---

## 4. Verification Results

- **Vite Build**: Compiles and bundles cleanly (`npx vite build` finishes successfully).
- **Unit Tests**: All 227 tests run and pass (`npx vitest run`).
